/**
 * Master Clinical Safety Pipeline
 *
 * ALL clinical decisions must pass through this pipeline before being
 * returned to any provider-facing or patient-facing interface.
 *
 * Priority order (hard-coded, non-negotiable):
 *   1. Sepsis detection (qSOFA / NEWS2)  → ER_NOW if score ≥ 2
 *   2. Pediatric deterioration (PEWS)    → ER_NOW if score ≥ 6, URGENT if ≥ 4
 *   3. Obstetric emergency              → ER_NOW for any critical OB finding
 *   4. Mental health / suicide risk     → ER_NOW for high/imminent ideation
 *   5. Hybrid engine conflict resolver  → deterministic vs. probabilistic merge
 *   6. Final output                     → disposition + full audit trail
 *
 * Design principle: any single safety trigger produces an immediate ER_NOW
 * that CANNOT be overridden by downstream probabilistic reasoning.
 *
 * The pipeline never silently fails — it returns SAFE_FALLBACK on error.
 */

import { detectSepsis,   type VitalSigns }            from "./sepsis";
import { PEWS,           type PedsVitals }             from "./pediatric";
import { obstetricCheck, type ObstetricInput }         from "./obstetric";
import { suicideRisk,    type SuicideRiskInput }       from "./mentalHealth";
import { resolveConflict,
         type DeterministicOutput,
         type ProbabilisticOutput,
         type ConflictResolutionResult } from "./conflictResolver";
import { logEvent }                                    from "../ops/auditEvents";
import { logSecureEvent }                              from "../ops/secureAudit";

export type SafetyTrigger =
  | "SEPSIS"
  | "PEDIATRIC_PEWS"
  | "OBSTETRIC_EMERGENCY"
  | "MENTAL_HEALTH_CRISIS"
  | "HYBRID_CONFLICT"
  | "NONE";

export interface SafetyPipelineInput {
  // Patient context
  patientId?:      string;
  clinicId?:       string;
  ageYears?:       number;

  // Vital signs
  vitals?: VitalSigns;

  // Pediatric specifics (only if ageYears < 18)
  pedsVitals?: PedsVitals;

  // Obstetric context
  obstetric?: ObstetricInput;

  // Mental health / crisis
  mentalHealth?: SuicideRiskInput & { phq9Score?: number };

  // Engine outputs to resolve
  deterministic?: DeterministicOutput;
  probabilistic?: ProbabilisticOutput | null;
}

export interface SafetyPipelineResult {
  disposition:         "ER_NOW" | "URGENT_24H" | "ROUTINE_72H" | "SELF_CARE" | "MONITOR";
  trigger:             SafetyTrigger;
  triggerDetail?:      string;
  finalDecision:       DeterministicOutput | ProbabilisticOutput | { disposition: string; diagnosis?: string };
  conflictResolution?: ConflictResolutionResult;
  overrides: {
    sepsis:    boolean;
    pediatric: boolean;
    obstetric: boolean;
    mentalHealth: boolean;
  };
  auditId:   string;
  processedAt: string;
}

const SAFE_FALLBACK: SafetyPipelineResult = {
  disposition:  "URGENT_24H",
  trigger:      "NONE",
  triggerDetail: "Safe fallback — pipeline error",
  finalDecision: { disposition: "URGENT_24H", diagnosis: "Unknown — manual review required" },
  overrides:    { sepsis: false, pediatric: false, obstetric: false, mentalHealth: false },
  auditId:      "FALLBACK",
  processedAt:  new Date().toISOString(),
};

/**
 * Run the complete clinical safety pipeline.
 * Returns a SafetyPipelineResult with full audit trail.
 */
export function safetyPipeline(input: SafetyPipelineInput): SafetyPipelineResult {
  const processedAt = new Date().toISOString();
  const auditId     = `SPL-${Date.now()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
  const overrides   = { sepsis: false, pediatric: false, obstetric: false, mentalHealth: false };

  try {
    // ── 1. Sepsis ──────────────────────────────────────────────────────────
    if (input.vitals) {
      const sepsis = detectSepsis(input.vitals);
      if (sepsis.highRisk) {
        overrides.sepsis = true;
        const result = makeResult("ER_NOW", "SEPSIS", sepsis.qsofa.rationale, auditId, processedAt, overrides);
        auditResult(result, input, "SEPSIS_OVERRIDE");
        return result;
      }
    }

    // ── 2. Pediatric PEWS ─────────────────────────────────────────────────
    const isPeds = (input.ageYears ?? 99) < 18;
    if (isPeds && (input.pedsVitals || input.vitals)) {
      const pedsInput: PedsVitals = input.pedsVitals ?? {
        ageYears:   input.ageYears ?? 10,
        heartRate:  input.vitals?.heartRate,
        respiratoryRate: input.vitals?.respiratoryRate,
        spo2:       input.vitals?.spo2,
        supplementalO2:  input.vitals?.supplementalO2,
        systolicBP: input.vitals?.systolicBP,
      };
      const pews = PEWS(pedsInput);
      if (pews.escalate) {
        overrides.pediatric = true;
        const result = makeResult(
          pews.disposition,
          "PEDIATRIC_PEWS",
          pews.rationale,
          auditId, processedAt, overrides
        );
        auditResult(result, input, "PEWS_OVERRIDE");
        return result;
      }
    }

    // ── 3. Obstetric ──────────────────────────────────────────────────────
    if (input.obstetric?.pregnant || input.obstetric?.postpartumDays !== undefined) {
      const ob = obstetricCheck(input.obstetric);
      if (ob?.emergency) {
        overrides.obstetric = true;
        const result = makeResult("ER_NOW", "OBSTETRIC_EMERGENCY", ob.rationale, auditId, processedAt, overrides);
        auditResult(result, input, "OB_OVERRIDE");
        return result;
      }
    }

    // ── 4. Mental health / suicide risk ────────────────────────────────────
    if (input.mentalHealth?.suicidalIdeation) {
      const mh = suicideRisk(input.mentalHealth);
      if (mh.highRisk) {
        overrides.mentalHealth = true;
        const result = makeResult(
          mh.disposition === "ER_NOW" ? "ER_NOW" : "URGENT_24H",
          "MENTAL_HEALTH_CRISIS",
          mh.rationale,
          auditId, processedAt, overrides
        );
        auditResult(result, input, "MH_OVERRIDE");
        return result;
      }
    }

    // ── 5. Hybrid conflict resolution ─────────────────────────────────────
    if (input.deterministic) {
      const resolution = resolveConflict({
        deterministic: input.deterministic,
        probabilistic: input.probabilistic ?? null,
      });

      const finalDisp = (resolution.final as DeterministicOutput).disposition ?? "MONITOR";

      const result: SafetyPipelineResult = {
        disposition:        finalDisp as SafetyPipelineResult["disposition"],
        trigger:            "HYBRID_CONFLICT",
        triggerDetail:      resolution.overrideReason,
        finalDecision:      resolution.final,
        conflictResolution: resolution,
        overrides,
        auditId,
        processedAt,
      };
      auditResult(result, input, "HYBRID_RESOLVE");
      return result;
    }

    // ── 6. Pass-through ───────────────────────────────────────────────────
    const passThrough: SafetyPipelineResult = {
      disposition:   "MONITOR",
      trigger:       "NONE",
      triggerDetail: "No safety triggers — standard assessment",
      finalDecision: { disposition: "MONITOR" },
      overrides,
      auditId,
      processedAt,
    };
    auditResult(passThrough, input, "PASS_THROUGH");
    return passThrough;

  } catch (err) {
    console.error("[SafetyPipeline] Error:", err);
    logEvent({ type: "SAFETY_PIPELINE_ERROR", severity: "critical", payload: { error: String(err), input } });
    return { ...SAFE_FALLBACK, processedAt, auditId };
  }
}

function makeResult(
  disposition: SafetyPipelineResult["disposition"],
  trigger: SafetyTrigger,
  triggerDetail: string,
  auditId: string,
  processedAt: string,
  overrides: SafetyPipelineResult["overrides"]
): SafetyPipelineResult {
  return {
    disposition,
    trigger,
    triggerDetail,
    finalDecision: { disposition },
    overrides,
    auditId,
    processedAt,
  };
}

function auditResult(result: SafetyPipelineResult, input: SafetyPipelineInput, action: string): void {
  logSecureEvent({
    type:     "TRIAGE_DECISION",
    actor:    "safety_pipeline",
    clinicId: input.clinicId,
    entityId: input.patientId,
    payload:  {
      action,
      auditId:     result.auditId,
      trigger:     result.trigger,
      disposition: result.disposition,
      overrides:   result.overrides,
    },
  });
}
