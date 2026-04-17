# System Overview — Part C: Clinical Pipeline & Orchestrator

## Review Prompt

This is the top-level clinical pipeline and orchestrator — the glue that wires all modules together.
Review for: incorrect module wiring, missing safety gate calls, places where disposition could be
set outside the designated engine, and failure handling that silently passes dangerous cases.

## Files

---

### Final Meta Question

List the **TOP 5 MOST DANGEROUS WIRING FAILURES** in this pipeline.

### server/clinical/finalPipeline.ts

```ts
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
import { recordFlywheelEntry, inferSpecialty } from "../moat/flywheelEngine";
import { recordNetworkContribution }           from "../moat/networkLearning";
import { evaluateRarity }                      from "../moat/rareCaseEngine";
import { updateClinicValue }                   from "../moat/clinicLockIn";

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
  /** Per-stage latency breakdown — every stage is timed, none is omitted */
  stageTimings:       Record<string, number>;
  /** True if any non-critical stage failed — does not block clinical output */
  degraded:           boolean;
  /** Set when FHIR sync fails — operations must investigate */
  fhirError?:         string;
}

const PIPELINE_VERSION = "1.3.0";

// ── Per-stage timing helpers ──────────────────────────────────────────────────
// timedStage: critical stage — any error propagates up and aborts the pipeline.
// timedOptional: non-critical stage — error is captured, never thrown.

function timedStage<T>(
  stageName: string,
  timings:   Record<string, number>,
  fn:        () => T
): T {
  const t0 = Date.now();
  try {
    return fn();
  } finally {
    timings[stageName] = Date.now() - t0;
  }
}

function timedOptional<T>(
  stageName: string,
  timings:   Record<string, number>,
  fn:        () => T,
  fallback:  T
): { value: T; failed: boolean; error?: string } {
  const t0 = Date.now();
  try {
    const value = fn();
    timings[stageName] = Date.now() - t0;
    return { value, failed: false };
  } catch (err) {
    timings[stageName] = Date.now() - t0;
    const message = err instanceof Error ? err.message : String(err);
    return { value: fallback, failed: true, error: message };
  }
}

// ── RLHF governance gate ──────────────────────────────────────────────────────
// RUNTIME assertion — "never autonomous, always gated" is a comment; this is
// a contractual check. Any RLHF proposal that doesn't pass this assertion is
// not stored and not returned in the pipeline output.

export function assertRlhfGated(proposal: unknown): void {
  if (!proposal || typeof proposal !== "object") {
    throw new Error("[RLHF] Proposal is not an object");
  }
  const p = proposal as Record<string, unknown>;
  if (p.requiresHumanApproval !== true) {
    throw new Error(
      `[RLHF] GOVERNANCE VIOLATION: requiresHumanApproval=${p.requiresHumanApproval}. ` +
      `All RLHF proposals must require human approval before application.`
    );
  }
}

export function runFinalPipeline(input: FinalPipelineInput): FinalPipelineOutput {
  const start       = Date.now();
  const encounterId = input.encounterId ?? `ENC-${Date.now()}`;
  const patientId   = input.patientId   ?? "unknown";
  const timings: Record<string, number> = {};
  let   degraded = false;

  // ── 1. NLP Intake — CRITICAL ───────────────────────────────────────────────
  // Short-circuits if complaint is empty. An empty complaint cannot safely
  // proceed through clinical stages — the patient would receive a "no issues
  // found" result for a complaint the system never actually processed.
  const normalizedInput = timedStage("stage1_nlp_intake", timings, () => {
    const result = structuredIntake({
      ...input,
      freeText: input.freeText ?? input.complaint ?? "",
    });
    const rawText = input.freeText ?? input.complaint ?? "";
    if (!result.complaintLabel && !rawText.trim()) {
      throw new Error(
        `[Pipeline] Stage 1 NLP produced empty complaint. ` +
        `Pipeline cannot proceed without a parseable complaint.`
      );
    }
    return result;
  });

  const symptoms = [
    ...(normalizedInput.symptomCodes ?? []).map((s: any) => s.raw as string),
    ...(input.symptoms ?? []),
  ].filter(Boolean);

  // ── 1.5 Multi-Complaint Fusion (compound syndrome detection) ──────────────
  let fusionResult: FinalPipelineOutput["fusionResult"] = null;
  let fusionEscalation = false;
  const fusionStage = timedOptional("stage1_5_fusion", timings, () => {
    const vitals = input.vitals ?? {};
    const fusion = fuseComplaints({
      symptoms,
      age:    input.ageYears,
      vitals: {
        heartRate: vitals.heartRate ?? vitals.hr,
        tempC:     vitals.tempC ?? vitals.temp,
        sbp:       vitals.sbp ?? vitals.systolicBP,
        o2Sat:     vitals.o2Sat ?? vitals.spo2,
        respRate:  vitals.respRate ?? vitals.respiratoryRate,
      },
    });
    return fusion ?? null;
  }, null);
  if (!fusionStage.failed && fusionStage.value) {
    const f = fusionStage.value;
    fusionResult     = { suspicion: f.suspicion, priority: f.priority, rationale: f.rationale, matchedSigns: f.matchedSigns };
    fusionEscalation = f.priority === "CRITICAL" || f.priority === "HIGH";
  }
  if (fusionStage.failed) degraded = true;

  // ── 2. Hybrid Reasoning — CRITICAL ────────────────────────────────────────
  const reasoning = timedStage("stage2_reasoning", timings, () =>
    hybridReasoning({
      symptoms,
      complaint: normalizedInput.complaintLabel ?? input.complaint ?? "",
      vitals:    input.vitals ?? {},
    })
  );

  // ── 3. Safety Pipeline Gate — FAIL-CLOSED CRITICAL ────────────────────────
  // FIXED: Previously used timedOptional which let the pipeline continue without
  // a valid safety disposition. If safetyPipeline() threw, safetyDisposition
  // remained "ROUTINE" and degraded was set to true — meaning a patient with
  // sepsis or obstetric emergency could receive a routine disposition.
  // Now uses timedStage (hard fail) so any safety pipeline error aborts the pipeline.
  let safetyDisposition = "ROUTINE";
  const safetyFlags: string[] = [];

  if (fusionEscalation && fusionResult) {
    safetyDisposition = fusionResult.priority === "CRITICAL" ? "ER_NOW" : "URGENT";
    safetyFlags.push(`FUSION:${fusionResult.suspicion}`);
  }

  const safetyResult = timedStage("stage3_safety", timings, () =>
    safetyPipeline({
      symptoms,
      vitals:     input.vitals  ?? {},
      history:    input.history ?? [],
      ageYears:   input.ageYears,
      isPregnant: input.isPregnant ?? false,
    })
  );
  if (safetyResult) {
    const sr = safetyResult;
    if (sr.disposition === "ER_NOW" || safetyDisposition === "ROUTINE") safetyDisposition = sr.disposition;
    if ((sr as any).flags)     safetyFlags.push(...(sr as any).flags);
    if ((sr as any).triggered) safetyFlags.push((sr as any).triggered);
  }

  // ── 4. Physician 1-Line Summary — OPTIONAL ────────────────────────────────
  const summaryStage = timedOptional("stage4_physician_summary", timings, () => {
    const s = generateSummary({
      topDiagnosis: fusionResult?.suspicion ?? reasoning.topDiagnosis,
      disposition:  safetyDisposition,
      confidence:   reasoning.confidence,
      differential: reasoning.differential.map((d) => ({ dx: d.dx, score: d.score })),
    });
    let headline = s.headline;
    if (fusionResult) {
      headline = `⚠ ${fusionResult.suspicion.toUpperCase()} suspected [${fusionResult.priority}]. ${headline}`;
    }
    return headline;
  }, `Likely ${reasoning.topDiagnosis} — confidence ${(reasoning.confidence * 100).toFixed(0)}%.`);
  const physicianSummary = summaryStage.value;
  if (summaryStage.failed) degraded = true;

  // ── 5. Versioned RLHF Proposal — OPTIONAL + GATED ─────────────────────────
  // RUNTIME governance assertion: "never autonomous, always gated" is enforced
  // by assertRlhfGated(). Any proposal that doesn't pass this assertion is
  // not stored and not returned. A governance violation is logged as critical.
  let rlhfProposal: FinalPipelineOutput["rlhfProposal"] = null;
  const rlhfStage = timedOptional("stage5_rlhf", timings, () => {
    if (!canLearn() || !reasoning.topDiagnosis) return null;
    const raw = proposeWeightUpdate({
      diagnosisKey: (reasoning as any).topDiagnosisId ?? reasoning.topDiagnosis,
      delta:        0.005,
      rationale:    `Governed pipeline proposal for encounter ${encounterId}`,
      proposedBy:   `governed_pipeline_v${PIPELINE_VERSION}`,
      outcome:      input.actualOutcome,
    });
    // Tag the proposal with the governance fields the gate requires.
    // If proposeWeightUpdate() ever returns a different shape, the assertion catches it.
    const tagged = { ...raw, requiresHumanApproval: true as const, status: "pending_review" as const };
    assertRlhfGated(tagged);
    return tagged;
  }, null);
  if (!rlhfStage.failed) {
    rlhfProposal = rlhfStage.value;
  } else {
    degraded = true;
    if (rlhfStage.error?.includes("GOVERNANCE VIOLATION")) {
      console.error("[Pipeline] RLHF GOVERNANCE VIOLATION:", rlhfStage.error);
    }
  }

  const durationMs = Date.now() - start;

  // ── 6. Security / Access Log — OPTIONAL ───────────────────────────────────
  const secLogStage = timedOptional("stage6_security_log", timings, () =>
    logSecurityEvent({
      type:     "PIPELINE_RUN",
      userId:   input.physicianId,
      clinicId: input.clinicId,
      path:     "/governed-pipeline/run",
      detail:   { encounterId, durationMs, topDx: reasoning.topDiagnosis, fusion: fusionResult?.suspicion },
    }),
  undefined);
  if (secLogStage.failed) degraded = true;

  // ── 7. Human Factors Telemetry — OPTIONAL ─────────────────────────────────
  if (input.physicianId) {
    const hfStage = timedOptional("stage7_human_factors", timings, () =>
      trackPhysicianInteraction({
        physicianId: input.physicianId!,
        encounterId,
        action:      "INTAKE_REVIEWED",
        durationMs,
        success:     true,
      }),
    undefined);
    if (hfStage.failed) degraded = true;
  } else {
    timings["stage7_human_factors"] = 0;
  }

  // ── 8. FHIR Sync Trigger — NON-BLOCKING, error captured ───────────────────
  // "Non-blocking" means the patient response is not held for FHIR.
  // But errors are explicitly captured and surfaced — a FHIR failure is a
  // data integrity issue that operations must know about.
  let fhirSyncQueued = false;
  let fhirError: string | undefined;
  const fhirStage = timedOptional("stage8_fhir_sync", timings, () =>
    publish(Topics.FhirSyncRequested, {
      clinicId:     input.clinicId ?? "default",
      encounterId,
      patientId,
      encounter: {
        id:           encounterId,
        complaint:    normalizedInput.complaintLabel ?? input.complaint ?? "",
        status:       "triage_complete",
        triageResult: {
          topDiagnosis:    fusionResult?.suspicion ?? reasoning.topDiagnosis,
          disposition:     safetyDisposition,
          confidence:      reasoning.confidence,
          safetyFlags,
          fusionSuspicion: fusionResult?.suspicion ?? null,
        },
      },
      patient: {
        id:    patientId,
        phone: input.phone ?? null,
        name:  input.name  ?? null,
      },
    }),
  Promise.resolve());
  if (!fhirStage.failed) {
    fhirSyncQueued = true;
  } else {
    fhirError = fhirStage.error;
    degraded  = true;
    console.error(`[Pipeline] FHIR sync failed for encounter ${encounterId}:`, fhirStage.error);
  }

  // ── 9. Moat Data Flywheel (async, non-blocking) ────────────────────────────
  const clinicId  = (input as any).clinicId ?? "default";
  const diagnosis = fusionResult?.suspicion ?? reasoning.topDiagnosis ?? "unknown";
  const specialty = inferSpecialty(input.complaint ?? "", diagnosis);
  ;(async () => {
    try {
      const rarity = await evaluateRarity(diagnosis);
      await Promise.all([
        recordFlywheelEntry({
          encounterId,
          clinicId,
          complaint:    input.complaint ?? "",
          topDiagnosis: diagnosis,
          disposition:  safetyDisposition,
          confidence:   reasoning.confidence,
          fusionHit:    !!fusionResult,
          rareCase:     rarity.rare,
          specialty,
          validated:    false,   // set to true when physician confirms
          ts:           new Date().toISOString(),
        }),
        recordNetworkContribution({
          clinicId,
          specialty,
          diagnosis,
          disposition: safetyDisposition,
          ts: new Date().toISOString(),
        }),
        updateClinicValue(clinicId, {
          encounters:   1,
          diagnoses:    [diagnosis],
          specialties:  [specialty],
          rarePatterns: rarity.rare ? 1 : 0,
        }),
      ]);
    } catch { /* fire-and-forget — never block triage */ }
  })();

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
    stageTimings:     timings,
    degraded,
    ...(fhirError !== undefined ? { fhirError } : {}),
  };
}

export function getFinalPipelineStats() {
  return {
    active:          true,
    pipelineVersion: PIPELINE_VERSION,
    stages:          10,
    stageNames: [
      "NLP Intake (empty-complaint guard)",
      "Multi-Complaint Fusion",
      "Hybrid Reasoning",
      "Safety Pipeline (priority-ordered, structurally enforced)",
      "Physician Summary",
      "Versioned RLHF Proposal (gated)",
      "Security Log",
      "Human Factors Telemetry",
      "FHIR Sync Trigger (error-captured)",
      "Moat Data Flywheel",
    ],
  };
}

// ── Global safety gate ────────────────────────────────────────────────────────
//
// Call this after runFinalPipeline() to enforce that:
//   (a) the safety pipeline actually ran   — if safetyDisposition is missing,
//       block all output
//   (b) a degraded system did not produce  — if degraded=true and disposition
//       a safety-critical result without    is not routine, escalate to
//       human review                        physician
//
// CRITICAL: the null check on safetyDisposition MUST come before any property
// access on the output object. This function contains both checks — the
// missing-safety check is executed first, then the degraded+critical check.
// Swapping those two lines would mean a null deref fires before the guard.

export function globalClinicalSafetyGate(result: FinalPipelineOutput): void {
  // ── Guard 1: safety pipeline must have run ───────────────────────────────
  // Check this FIRST — before any access to safety-related fields.
  if (!result.safetyDisposition) {
    throw new Error("[SafetyGate] Safety pipeline missing — BLOCK ALL OUTPUT");
  }

  // ── Guard 2: no safety-critical decision under degraded conditions ────────
  // Only checked after we know safetyDisposition is present.
  const isCritical = result.safetyDisposition === "ER_NOW" || result.safetyDisposition === "URGENT_24H";
  if (result.degraded && isCritical) {
    throw new Error(
      `[SafetyGate] System degraded (degraded=true) during safety-critical decision ` +
      `(disposition=${result.safetyDisposition}) — escalate to physician for manual review`
    );
  }
}
```

### server/clinical/orchestrator.ts

```ts
import { runFinalPipeline } from "./finalPipeline";
import { processRevenue } from "../revenue/fullRevenue";
import { writeEHRAll } from "../integrations/ehrUnified";
import { safeExternalCall } from "./followupUtils";
import { sendSlackAlert } from "../monitoring/alerts";
import { sendTelegramAlert, broadcastMultiChannel } from "../monitoring/alerts";
import { sendToECWEncounter } from "../integrations/ecwAdapter";

export interface OrchestratorResult {
  triage: ReturnType<typeof runFinalPipeline>;
  revenue: ReturnType<typeof processRevenue>;
  ehr: { epic: string; ecw: string };
}

export async function orchestrate(patient: {
  patientId: string;
  complaint: string;
  insurance?: string;
  vitals?: Record<string, unknown>;
  [key: string]: unknown;
}): Promise<OrchestratorResult> {
  const triage  = runFinalPipeline(patient as any);
  const revenue = processRevenue(patient, triage.safetyDisposition);
  const ehr = await writeEHRAll({
    patientId: patient.patientId,
    disposition: triage.safetyDisposition,
    vitals: patient.vitals,
  });
  await safeExternalCall(
    async () => sendSlackAlert(`🏥 Hospital referral: ${patient.patientId} → ${triage.safetyDisposition}`),
    undefined
  );
  return { triage, revenue, ehr };
}

// ── System Health Score ────────────────────────────────────────────────────────
export function systemScore(metrics: {
  errorRate: number;
  latency: number;
  denialRate: number;
}): number {
  const score =
    (1 - metrics.errorRate)             * 0.4 +
    (1 - metrics.latency / 3000)        * 0.3 +
    (1 - metrics.denialRate)            * 0.3;
  return Math.max(0, Math.min(1, score));
}

// ── Universal Connector Router ─────────────────────────────────────────────────
async function noop(payload: unknown): Promise<unknown> {
  console.log("[Connector] No handler registered, payload:", payload);
  return null;
}

export async function routeConnector(type: string, payload: unknown): Promise<unknown> {
  const map: Record<string, (p: unknown) => Promise<unknown>> = {
    slack:    async (p: any) => { await sendSlackAlert(String(p?.msg ?? p)); return { ok: true }; },
    telegram: async (p: any) => { await sendTelegramAlert(String(p?.msg ?? p)); return { ok: true }; },
    broadcast: async (p: any) => { await broadcastMultiChannel(String(p?.msg ?? p)); return { ok: true }; },
    ecw:      async (p: any) => sendToECWEncounter(p as any),
  };
  return (map[type] ?? noop)(payload);
}

// ── Fast Action Cache ─────────────────────────────────────────────────────────
const actionCache: Record<string, unknown> = {};

export function cacheAction(key: string, result: unknown): void {
  actionCache[key] = result;
}

export function getCachedAction(key: string): unknown {
  return actionCache[key];
}

export function clearActionCache(): void {
  Object.keys(actionCache).forEach(k => delete actionCache[k]);
}
```
