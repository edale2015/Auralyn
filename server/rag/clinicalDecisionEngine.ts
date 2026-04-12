/**
 * Clinical Decision Engine (CDE) — orchestrates the full 6-layer pipeline
 *
 * Layer 1  →  Safety Gate       (short-circuit for emergencies)
 * Layer 2  →  Query Router      (ACUTE_HIGH_RISK | GENERAL_MEDICAL | DEVICE_QUERY | OUT_OF_SCOPE)
 * Layer 3  →  Multi-Source Retrieval  (KB + Knowledge Graph + Skill Layer)
 * Layer 4  →  Relevance Scoring  (keyword TF-IDF, filter < threshold)
 * Layer 5  →  Clinical Reasoning (differential diagnosis, red flags, next steps)
 * Layer 6  →  Disposition Engine (HOME | URGENT_CARE | ER | ICU + confidence)
 *
 * Each layer result is stored in the trace for full audit replay.
 */

import { runSafetyGate,       type SafetyGateResult }        from "./safetyGate";
import { routeQuery,          type RoutingResult }            from "./clinicalQueryRouter";
import { retrieveMultiSource, type MultiSourceResult }        from "./multiSourceRetriever";
import { scoreChunks, filterContext, type ScoredChunk }       from "./relevanceScorer";
import { clinicalReason,      type ClinicalReasoningOutput }  from "./clinicalReasoner";
import { computeDisposition,  type DispositionOutput }        from "./dispositionEngine";
import { logEvent }                                           from "../ops/auditEvents";

export interface CDETraceStep {
  layer:   string;
  at:      string;
  summary: Record<string, any>;
}

export interface CDEResult {
  query:        string;
  gate:         SafetyGateResult;
  route:        RoutingResult;
  retrieval:    MultiSourceResult;
  scored:       ScoredChunk[];
  context:      ScoredChunk[];
  reasoning:    ClinicalReasoningOutput;
  disposition:  DispositionOutput;
  durationMs:   number;
  trace:        CDETraceStep[];
}

function tag(trace: CDETraceStep[], layer: string, summary: Record<string, any>) {
  trace.push({ layer, at: new Date().toISOString(), summary });
}

export async function runClinicalDecisionEngine(query: string): Promise<CDEResult> {
  const t0    = Date.now();
  const trace: CDETraceStep[] = [];

  // ── Layer 1: Safety Gate ──────────────────────────────────────────────────
  const gate = runSafetyGate(query);
  tag(trace, "safety_gate", { decision: gate.decision, escalated: gate.escalated, riskLevel: gate.riskLevel });

  // ── Layer 2: Query Router ─────────────────────────────────────────────────
  const route = routeQuery(query);
  tag(trace, "query_router", { route: route.route, confidence: route.confidence, terms: route.matchedTerms });

  // ── Layer 3: Multi-Source Retrieval ───────────────────────────────────────
  const retrieval = await retrieveMultiSource(query, route.route);
  tag(trace, "retrieval", { sources: retrieval.sourceCounts, total: retrieval.totalRetrieved });

  // ── Layer 4: Relevance Scoring ────────────────────────────────────────────
  const scored     = scoreChunks(query, retrieval.chunks);
  const { context, filtered, avgScore } = filterContext(scored);
  tag(trace, "relevance_scoring", { passed: context.length, filtered, avgScore });

  // ── Layer 5: Clinical Reasoning ───────────────────────────────────────────
  const reasoning = await clinicalReason(query, context);
  tag(trace, "clinical_reasoning", {
    ddxCount:  reasoning.differentialDiagnosis.length,
    urgency:   reasoning.urgency,
    source:    reasoning.source,
    redFlags:  reasoning.redFlags.length,
  });

  // ── Layer 6: Disposition Engine ───────────────────────────────────────────
  const disposition = computeDisposition(reasoning, gate, route);
  tag(trace, "disposition", {
    disposition: disposition.disposition,
    confidence:  disposition.confidence,
    overridden:  disposition.overrideApplied,
  });

  const result: CDEResult = {
    query, gate, route, retrieval, scored, context,
    reasoning, disposition,
    durationMs: Date.now() - t0,
    trace,
  };

  // Audit log
  logEvent({
    actor:      "clinical_decision_engine",
    action:     `cde:${disposition.disposition.toLowerCase()}`,
    entityType: "query",
    entityId:   query.slice(0, 60),
    details: {
      route:       route.route,
      disposition: disposition.disposition,
      confidence:  disposition.confidence,
      escalated:   gate.escalated,
      durationMs:  result.durationMs,
    },
  });

  return result;
}
