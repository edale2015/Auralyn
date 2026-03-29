/**
 * Final Governed Pipeline (Section 8) — v1.1.0
 *
 * 8-stage authoritative clinical flow:
 *   1. NLP Intake              — normalise free-text → canonical ICD-10
 *   1.5 Multi-Complaint Fusion — detect high-acuity compound syndromes (NEW)
 *   2. Hybrid Reasoning        — deterministic fusion first, Bayesian fallback
 *   3. Safety Pipeline         — Sepsis / PEWS / OB / Mental-Health gate
 *   4. Explainability          — 1-line physician summary
 *   5. Versioned RLHF Proposal — never autonomous, always gated
 *   6. Security Log            — audit every invocation
 *   7. Human-Factors Emit      — INTAKE_REVIEWED telemetry
 *   8. FHIR Sync Trigger       — async publish to EHR worker (non-blocking)
 */

import { structuredIntake }           from "./nlpIntake";
import { hybridReasoning }            from "./hybridReasoning";
import { safetyPipeline }             from "./safetyPipeline";
import { generateSummary }            from "./physicianSummary";
import { fuseComplaints }             from "./multiComplaintFusion";
import { proposeWeightUpdate }        from "../learning/versionedRLHF";
import { logSecurityEvent }           from "../ops/security";
import { trackPhysicianInteraction }  from "./humanFactors";
import { canLearn }                   from "../release/modelFreeze";
import { publish }                    from "../events/bus";
import { Topics }                     from "../events/topics";

export interface FinalPipelineInput {
  freeText?:    string;
  complaint?:   string;
  symptoms?:    string[];
  vitals?:      Record<string, number>;
  history?:     string[];
  patientId?:   string;
  encounterId?: string;
  physicianId?: string;
  clinicId?:    string;
  ageYears?:    number;
  isPregnant?:  boolean;
  actualOutcome?: string;
  [key: string]: any;
}

export interface FinalPipelineOutput {
  encounterId:        string;
  patientId:          string;
  normalizedInput:    ReturnType<typeof structuredIntake>;
  fusionResult:       { suspicion: string; priority: string; rationale: string; matchedSigns: string[] } | null;
  topDiagnosis:       string;
  confidence:         number;
  differential:       Array<{ dx: string; id?: string; score: number; label?: string }>;
  explainability:     string;
  safetyDisposition:  string;
  safetyFlags:        string[];
  physicianSummary:   string;
  rlhfProposal:       { accepted: boolean; proposalId: string; reason?: string } | null;
  durationMs:         number;
  pipelineVersion:    string;
  governedAt:         string;
  fhirSyncQueued:     boolean;
}

const PIPELINE_VERSION = "1.1.0";

export function runFinalPipeline(input: FinalPipelineInput): FinalPipelineOutput {
  const start       = Date.now();
  const encounterId = input.encounterId ?? `ENC-${Date.now()}`;
  const patientId   = input.patientId   ?? "unknown";

  // ── 1. NLP Intake ─────────────────────────────────────────────────────────
  const normalizedInput = structuredIntake({
    ...input,
    freeText: input.freeText ?? input.complaint ?? "",
  });

  const symptoms = [
    ...(normalizedInput.symptomCodes ?? []).map((s: any) => s.raw as string),
    ...(input.symptoms ?? []),
  ].filter(Boolean);

  // ── 1.5 Multi-Complaint Fusion (compound syndrome detection) ──────────────
  let fusionResult: FinalPipelineOutput["fusionResult"] = null;
  let fusionEscalation = false;
  try {
    const vitals = input.vitals ?? {};
    const fusionInput = {
      symptoms,
      age:    input.ageYears,
      vitals: {
        heartRate: vitals.heartRate ?? vitals.hr,
        tempC:     vitals.tempC ?? vitals.temp,
        sbp:       vitals.sbp ?? vitals.systolicBP,
        o2Sat:     vitals.o2Sat ?? vitals.spo2,
        respRate:  vitals.respRate ?? vitals.respiratoryRate,
      },
    };
    const fusion = fuseComplaints(fusionInput);
    if (fusion) {
      fusionResult = {
        suspicion:    fusion.suspicion,
        priority:     fusion.priority,
        rationale:    fusion.rationale,
        matchedSigns: fusion.matchedSigns,
      };
      fusionEscalation = fusion.priority === "CRITICAL" || fusion.priority === "HIGH";
    }
  } catch {
    // never block pipeline
  }

  // ── 2. Hybrid Reasoning (fusion → Bayesian fallback) ──────────────────────
  const reasoning = hybridReasoning({
    symptoms,
    complaint: normalizedInput.complaintLabel ?? input.complaint ?? "",
    vitals:    input.vitals ?? {},
  });

  // ── 3. Safety Pipeline Gate ───────────────────────────────────────────────
  let safetyDisposition = "ROUTINE";
  const safetyFlags: string[] = [];

  // If multi-complaint fusion triggered CRITICAL, hard-escalate before safety pipeline
  if (fusionEscalation && fusionResult) {
    safetyDisposition = fusionResult.priority === "CRITICAL" ? "ER_NOW" : "URGENT";
    safetyFlags.push(`FUSION:${fusionResult.suspicion}`);
  }

  try {
    const safetyResult = safetyPipeline({
      symptoms,
      vitals:     input.vitals     ?? {},
      history:    input.history    ?? [],
      ageYears:   input.ageYears,
      isPregnant: input.isPregnant ?? false,
    });
    // Safety pipeline can only upgrade, never downgrade
    if (safetyResult.disposition === "ER_NOW" || safetyDisposition === "ROUTINE") {
      safetyDisposition = safetyResult.disposition;
    }
    if ((safetyResult as any).flags) safetyFlags.push(...(safetyResult as any).flags);
    if ((safetyResult as any).triggered) safetyFlags.push((safetyResult as any).triggered);
  } catch {
    // Best-effort; never block the governed response
  }

  // ── 4. Physician 1-Line Summary ───────────────────────────────────────────
  let physicianSummary = "";
  try {
    const summaryResult = generateSummary({
      topDiagnosis: fusionResult?.suspicion ?? reasoning.topDiagnosis,
      disposition:  safetyDisposition,
      confidence:   reasoning.confidence,
      differential: reasoning.differential.map((d) => ({ dx: d.dx, score: d.score })),
    });
    physicianSummary = summaryResult.headline;
    if (fusionResult) {
      physicianSummary = `⚠ ${fusionResult.suspicion.toUpperCase()} suspected [${fusionResult.priority}]. ${physicianSummary}`;
    }
  } catch {
    physicianSummary = `Likely ${reasoning.topDiagnosis} — confidence ${(reasoning.confidence * 100).toFixed(0)}%.`;
  }

  // ── 5. Versioned RLHF Proposal (never autonomous) ─────────────────────────
  let rlhfProposal: FinalPipelineOutput["rlhfProposal"] = null;
  if (canLearn() && reasoning.topDiagnosis) {
    rlhfProposal = proposeWeightUpdate({
      diagnosisKey: (reasoning as any).topDiagnosisId ?? reasoning.topDiagnosis,
      delta:        0.005,
      rationale:    `Governed pipeline proposal for encounter ${encounterId}`,
      proposedBy:   `governed_pipeline_v${PIPELINE_VERSION}`,
      outcome:      input.actualOutcome,
    });
  }

  const durationMs = Date.now() - start;

  // ── 6. Security / Access Log ──────────────────────────────────────────────
  try {
    logSecurityEvent({
      type:     "PIPELINE_RUN",
      userId:   input.physicianId,
      clinicId: input.clinicId,
      path:     "/governed-pipeline/run",
      detail:   { encounterId, durationMs, topDx: reasoning.topDiagnosis, fusion: fusionResult?.suspicion },
    });
  } catch { /* non-blocking */ }

  // ── 7. Human Factors Telemetry ────────────────────────────────────────────
  if (input.physicianId) {
    try {
      trackPhysicianInteraction({
        physicianId: input.physicianId,
        encounterId,
        action:      "INTAKE_REVIEWED",
        durationMs,
        success:     true,
      });
    } catch { /* non-blocking */ }
  }

  // ── 8. FHIR Sync Trigger (async, non-blocking) ────────────────────────────
  let fhirSyncQueued = false;
  try {
    publish(Topics.FhirSyncRequested, {
      clinicId:     input.clinicId ?? "default",
      encounterId,
      patientId,
      encounter: {
        id:           encounterId,
        complaint:    normalizedInput.complaintLabel ?? input.complaint ?? "",
        status:       "triage_complete",
        triageResult: {
          topDiagnosis:  fusionResult?.suspicion ?? reasoning.topDiagnosis,
          disposition:   safetyDisposition,
          confidence:    reasoning.confidence,
          safetyFlags,
          fusionSuspicion: fusionResult?.suspicion ?? null,
        },
      },
      patient: {
        id:    patientId,
        phone: input.phone ?? null,
        name:  input.name  ?? null,
      },
    }).catch(() => {/* fire-and-forget */});
    fhirSyncQueued = true;
  } catch { /* non-blocking */ }

  return {
    encounterId,
    patientId,
    normalizedInput,
    fusionResult,
    topDiagnosis:     fusionResult?.suspicion ?? reasoning.topDiagnosis,
    confidence:       reasoning.confidence,
    differential:     reasoning.differential,
    explainability:   reasoning.explainability,
    safetyDisposition,
    safetyFlags,
    physicianSummary,
    rlhfProposal,
    durationMs,
    pipelineVersion:  PIPELINE_VERSION,
    governedAt:       new Date().toISOString(),
    fhirSyncQueued,
  };
}

export function getFinalPipelineStats() {
  return {
    active:          true,
    pipelineVersion: PIPELINE_VERSION,
    stages:          8,
    stageNames: [
      "NLP Intake",
      "Multi-Complaint Fusion",
      "Hybrid Reasoning",
      "Safety Pipeline",
      "Physician Summary",
      "Versioned RLHF Proposal",
      "Security Log",
      "Human Factors Telemetry",
      "FHIR Sync Trigger",
    ],
  };
}
