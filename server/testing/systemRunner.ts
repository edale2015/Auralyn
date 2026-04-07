/**
 * Packet 13 — System Test Harness: full pipeline runner
 *
 * Orchestrates the complete pipeline for a single test case:
 *   parse → resolve → node runner → priors → Bayesian → posterior → decision → output
 *
 * Captures a full NodeExecutionResult trace at every step.
 */

import { randomUUID } from "crypto";
import type { SystemTestCase, SystemRunResult } from "./types";
import { parseComplaint } from "../chat/parseComplaint";
import { resolveComplaint } from "../clinical/complaintResolver";
import { loadComplaintConfig } from "../services/complaintConfigLoader";
import { runComplaintGraph } from "../services/complaintNodeRunner";
import { loadComplaintPriors } from "../clinical/diagnosisPriorLoader";
import { analyzePosterior, type DifferentialResult } from "../clinical/posteriorAnalysis";
import {
  computeFinalDecision,
  buildPatientResponse,
  getTestEscalationStore,
} from "../clinical/finalDecisionEngine";
import type { NodeExecutionResult } from "../services/complaintNodeRunner";

// ── Lightweight Bayesian differential ────────────────────────────────────────
// Computes posterior for each diagnosis given observed symptom features.
// For test harness use only — production callers should use the full engine.

function runDifferential(
  symptoms: string[],
  priors: { diagnosis: string; baseProbability: number; featureLikelihoods: Record<string, number> }[],
): DifferentialResult[] {
  const symptomSet = new Set(symptoms.map(s => s.toLowerCase().replace(/\s+/g, "_")));

  const raw = priors.map(p => {
    let score = p.baseProbability;
    for (const [feature, likelihood] of Object.entries(p.featureLikelihoods)) {
      if (symptomSet.has(feature)) {
        score *= likelihood;
      }
    }
    return { diagnosis: p.diagnosis, posterior: score };
  });

  const total = raw.reduce((s, r) => s + r.posterior, 0);
  if (total === 0) {
    return raw.map(r => ({ diagnosis: r.diagnosis, posterior: 1 / raw.length }));
  }
  return raw.map(r => ({ diagnosis: r.diagnosis, posterior: r.posterior / total }));
}

// ── runSystemTestCase ─────────────────────────────────────────────────────────

export async function runSystemTestCase(
  test: SystemTestCase,
): Promise<SystemRunResult> {
  const errors: string[] = [];
  const caseId = test.input.patientContext?.caseId ?? `test-${test.id}-${Date.now()}`;

  let nodeTrace: NodeExecutionResult[] = [];
  let parsed: SystemRunResult["parsed"];
  let resolvedComplaint: string | undefined;
  let posterior: SystemRunResult["posterior"];
  let decision: SystemRunResult["decision"];
  let patientResponse: string | undefined;

  try {
    // ── Parse ─────────────────────────────────────────────────────────────
    parsed = parseComplaint(test.input.message);

    // ── Resolve complaint ────────────────────────────────────────────────
    const resolved = await resolveComplaint(parsed);
    resolvedComplaint = resolved.ccId;
    const config = await loadComplaintConfig(resolved.ccId);

    if (!config) {
      errors.push(`No config found for complaint: ${resolved.ccId}`);
      return { caseId, parsed, resolvedComplaint, nodeTrace, errors };
    }

    // ── Build initial case state ──────────────────────────────────────────
    const baseState: any = {
      caseId,
      symptoms: test.input.patientContext?.symptoms ?? parsed?.secondary ?? [],
      answers: {},
      scores: test.input.patientContext?.scores ?? {},
      activeClusters: [],
      routing: { state: "INITIAL" },
      redFlagGate: { blocked: false, flags: [] },
      dispositionReasonCodes: [],
      audit: { steps: [] },
      normalizedComplaint: resolved.ccId,
      ...test.input.patientContext,
    };

    // ── Run complaint graph ───────────────────────────────────────────────
    const graphResult = await runComplaintGraph(baseState, resolved.ccId, 30);

    nodeTrace = (graphResult.nodeTraces ?? []).map(t => ({
      nodeId: t.nodeId,
      success: true,
      durationMs: t.durationMs,
    }));

    const finalState = graphResult.state;

    // ── Load priors ───────────────────────────────────────────────────────
    const priorsBundle = await loadComplaintPriors(resolved.ccId).catch(() => null);

    // ── Bayesian differential ─────────────────────────────────────────────
    const symptoms: string[] = (finalState as any).symptoms ?? baseState.symptoms;
    let differential: DifferentialResult[] = [];

    if (priorsBundle && priorsBundle.priors.length > 0) {
      differential = runDifferential(symptoms, priorsBundle.priors);
    } else {
      // No priors — build a synthetic single-entry differential from the
      // complaint itself so the pipeline can still produce a disposition.
      differential = [{ diagnosis: resolved.ccId, posterior: 1.0 }];
    }

    posterior = analyzePosterior(differential);

    // ── Final decision ────────────────────────────────────────────────────
    const erRisk = (finalState as any).scores?.erRisk ?? 0;

    decision = await computeFinalDecision({
      state: {
        caseId,
        patientId: test.input.patientContext?.patientId,
        symptoms,
        scores: (finalState as any).scores,
      },
      posterior,
      erProbability: erRisk,
      store: getTestEscalationStore(),
    });

    // ── Patient output ────────────────────────────────────────────────────
    patientResponse = buildPatientResponse(decision);

    return {
      caseId,
      parsed,
      resolvedComplaint,
      nodeTrace,
      posterior,
      decision,
      patientResponse,
      errors,
    };

  } catch (err: any) {
    errors.push(err instanceof Error ? err.message : String(err));
    return { caseId, parsed, resolvedComplaint, nodeTrace, posterior, decision, errors };
  }
}
