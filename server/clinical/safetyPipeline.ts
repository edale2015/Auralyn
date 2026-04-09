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
 * STRUCTURAL ENFORCEMENT (applied in this version):
 *
 *   Previously, the priority was enforced only by the order in which if-blocks
 *   appeared in the function body. Any refactor, merge conflict resolution, or
 *   IDE-assisted sort could silently reorder the checks — a patient presenting
 *   with qSOFA ≥ 2 could reach the conflict resolver before the sepsis gate.
 *
 *   Fix: checks are registered as objects in SAFETY_CHECKS[] with explicit
 *   numeric priority fields. ORDERED_CHECKS is sorted by priority once at
 *   module load. The runner iterates ORDERED_CHECKS — not the source order of
 *   the registration array. Reordering the registration lines does nothing.
 *   Adding a new check requires assigning a priority number, which is validated
 *   for duplicates at module load time.
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

// ── Public types (unchanged — backward compatible) ────────────────────────────

export type SafetyTrigger =
  | "SEPSIS"
  | "PEDIATRIC_PEWS"
  | "OBSTETRIC_EMERGENCY"
  | "MENTAL_HEALTH_CRISIS"
  | "HYBRID_CONFLICT"
  | "NONE";

export interface SafetyPipelineInput {
  patientId?:      string;
  clinicId?:       string;
  ageYears?:       number;
  vitals?:         VitalSigns;
  pedsVitals?:     PedsVitals;
  obstetric?:      ObstetricInput;
  mentalHealth?:   SuicideRiskInput & { phq9Score?: number };
  deterministic?:  DeterministicOutput;
  probabilistic?:  ProbabilisticOutput | null;
}

export interface SafetyPipelineResult {
  disposition:         "ER_NOW" | "URGENT_24H" | "ROUTINE_72H" | "SELF_CARE" | "MONITOR";
  trigger:             SafetyTrigger;
  triggerDetail?:      string;
  finalDecision:       DeterministicOutput | ProbabilisticOutput | { disposition: string; diagnosis?: string };
  conflictResolution?: ConflictResolutionResult;
  overrides: {
    sepsis:      boolean;
    pediatric:   boolean;
    obstetric:   boolean;
    mentalHealth: boolean;
  };
  auditId:     string;
  processedAt: string;
}

// ── Internal types ────────────────────────────────────────────────────────────

type Overrides = SafetyPipelineResult["overrides"];

/**
 * A single safety check handler.
 *
 * Returns a SafetyPipelineResult if the check is triggered (the pipeline
 * should stop here for shortCircuit checks, or continue accumulating for
 * non-shortCircuit checks).
 *
 * Returns null if the check is not applicable or not triggered — the runner
 * continues to the next check.
 */
interface SafetyCheck {
  /**
   * Unique priority number. Lower = runs earlier.
   * Gaps are intentional — leave room to insert checks without renumbering.
   * Validated for uniqueness at module load; duplicates throw immediately.
   */
  priority:     number;
  name:         SafetyTrigger;
  /**
   * If true and the check returns a non-null result, the pipeline stops
   * immediately without running lower-priority checks.
   * If false, the result is returned but execution continues.
   */
  shortCircuit: boolean;
  run: (
    input:       SafetyPipelineInput,
    overrides:   Overrides,
    auditId:     string,
    processedAt: string
  ) => SafetyPipelineResult | null;
}

// ── Priority-ordered check registry ──────────────────────────────────────────
//
// REGISTRATION ORDER DOES NOT MATTER.
// The runner sorts SAFETY_CHECKS by priority at module load and iterates
// ORDERED_CHECKS — a reorder of the entries below has no effect on execution.

const SAFETY_CHECKS: SafetyCheck[] = [
  {
    priority:     10,
    name:         "SEPSIS",
    shortCircuit: true,
    run: (input, overrides, auditId, processedAt) => {
      if (!input.vitals) return null;
      const sepsis = detectSepsis(input.vitals);
      if (!sepsis.highRisk) return null;
      overrides.sepsis = true;
      return makeResult("ER_NOW", "SEPSIS", sepsis.qsofa.rationale, auditId, processedAt, overrides);
    },
  },

  {
    priority:     20,
    name:         "PEDIATRIC_PEWS",
    shortCircuit: true,
    run: (input, overrides, auditId, processedAt) => {
      const isPeds = (input.ageYears ?? 99) < 18;
      if (!isPeds || (!input.pedsVitals && !input.vitals)) return null;

      const pedsInput: PedsVitals = input.pedsVitals ?? {
        ageYears:        input.ageYears ?? 10,
        heartRate:       input.vitals?.heartRate,
        respiratoryRate: input.vitals?.respiratoryRate,
        spo2:            input.vitals?.spo2,
        supplementalO2:  input.vitals?.supplementalO2,
        systolicBP:      input.vitals?.systolicBP,
      };

      const pews = PEWS(pedsInput);
      if (!pews.escalate) return null;
      overrides.pediatric = true;
      return makeResult(pews.disposition, "PEDIATRIC_PEWS", pews.rationale, auditId, processedAt, overrides);
    },
  },

  {
    priority:     30,
    name:         "OBSTETRIC_EMERGENCY",
    shortCircuit: true,
    run: (input, overrides, auditId, processedAt) => {
      if (!input.obstetric?.pregnant && input.obstetric?.postpartumDays === undefined) return null;
      const ob = obstetricCheck(input.obstetric!);
      if (!ob?.emergency) return null;
      overrides.obstetric = true;
      return makeResult("ER_NOW", "OBSTETRIC_EMERGENCY", ob.rationale, auditId, processedAt, overrides);
    },
  },

  {
    priority:     40,
    name:         "MENTAL_HEALTH_CRISIS",
    shortCircuit: true,
    run: (input, overrides, auditId, processedAt) => {
      if (!input.mentalHealth?.suicidalIdeation) return null;
      const mh = suicideRisk(input.mentalHealth);
      if (!mh.highRisk) return null;
      overrides.mentalHealth = true;
      return makeResult(
        mh.disposition === "ER_NOW" ? "ER_NOW" : "URGENT_24H",
        "MENTAL_HEALTH_CRISIS",
        mh.rationale,
        auditId, processedAt, overrides
      );
    },
  },

  {
    priority:     50,
    name:         "HYBRID_CONFLICT",
    shortCircuit: false,   // conflict resolution is not a hard-stop on its own
    run: (input, _overrides, auditId, processedAt) => {
      if (!input.deterministic) return null;
      const resolution = resolveConflict({
        deterministic: input.deterministic,
        probabilistic: input.probabilistic ?? null,
      });
      const finalDisp = (resolution.final as DeterministicOutput).disposition ?? "MONITOR";
      return {
        disposition:        finalDisp as SafetyPipelineResult["disposition"],
        trigger:            "HYBRID_CONFLICT",
        triggerDetail:      resolution.overrideReason,
        finalDecision:      resolution.final,
        conflictResolution: resolution,
        overrides:          { ..._overrides },
        auditId,
        processedAt,
      };
    },
  },
];

// ── Module-load validation ────────────────────────────────────────────────────
// Fail fast: duplicate priorities are caught immediately at startup, not at
// runtime when a patient is on the other end of the request.

const _priorities = SAFETY_CHECKS.map(c => c.priority);
const _uniquePriorities = new Set(_priorities);
if (_uniquePriorities.size !== _priorities.length) {
  const dups = _priorities.filter((p, i) => _priorities.indexOf(p) !== i);
  throw new Error(
    `[SafetyPipeline] Duplicate priority values detected: [${dups.join(", ")}]. ` +
    `Each check must have a unique priority number.`
  );
}

/**
 * Priority-sorted execution order — computed once at module load.
 * This is what the runner iterates. The registration order above is irrelevant.
 */
const ORDERED_CHECKS = [...SAFETY_CHECKS].sort((a, b) => a.priority - b.priority);

// ── Fallback ──────────────────────────────────────────────────────────────────

const SAFE_FALLBACK: SafetyPipelineResult = {
  disposition:   "URGENT_24H",
  trigger:       "NONE",
  triggerDetail: "Safe fallback — pipeline error",
  finalDecision: { disposition: "URGENT_24H", diagnosis: "Unknown — manual review required" },
  overrides:     { sepsis: false, pediatric: false, obstetric: false, mentalHealth: false },
  auditId:       "FALLBACK",
  processedAt:   new Date().toISOString(),
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Run the complete clinical safety pipeline.
 *
 * Priority enforcement is structural:
 * - Checks are registered with explicit priority numbers in SAFETY_CHECKS[]
 * - ORDERED_CHECKS is sorted by priority once at module load
 * - The runner iterates ORDERED_CHECKS, not the registration order
 * - Reordering the registration array has zero effect on execution order
 * - Duplicate priority numbers are caught at startup (not at runtime)
 */
export function safetyPipeline(input: SafetyPipelineInput): SafetyPipelineResult {
  const processedAt = new Date().toISOString();
  const auditId     = `SPL-${Date.now()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
  const overrides: Overrides = { sepsis: false, pediatric: false, obstetric: false, mentalHealth: false };

  try {
    for (const check of ORDERED_CHECKS) {
      let result: SafetyPipelineResult | null;

      try {
        result = check.run(input, overrides, auditId, processedAt);
      } catch (checkErr) {
        // A failing safety check is never silently skipped.
        // It produces a conservative result that escalates to physician review.
        console.error(`[SafetyPipeline] Check "${check.name}" threw:`, checkErr);
        logEvent({
          type:     "SAFETY_CHECK_ERROR",
          severity: "critical",
          payload:  { check: check.name, error: String(checkErr), input },
        });
        result = makeResult(
          "URGENT_24H",
          check.name,
          `Safety check "${check.name}" encountered an error — conservative escalation applied`,
          auditId, processedAt, overrides
        );
      }

      if (result !== null) {
        auditResult(result, input, `${check.name}_OVERRIDE`);
        // Short-circuit checks (sepsis, PEWS, OB, MH) stop the pipeline immediately.
        // Non-short-circuit checks (hybrid conflict) return their result and continue.
        if (check.shortCircuit) {
          return result;
        }
        // Non-shortCircuit: return but the pipeline already ran all higher-priority
        // checks by this point; this is always the last meaningful step.
        return result;
      }
    }

    // ── Pass-through: no triggers fired ──────────────────────────────────────
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
    console.error("[SafetyPipeline] Fatal error:", err);
    logEvent({ type: "SAFETY_PIPELINE_ERROR", severity: "critical", payload: { error: String(err), input } });
    return { ...SAFE_FALLBACK, processedAt, auditId };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeResult(
  disposition:  SafetyPipelineResult["disposition"],
  trigger:      SafetyTrigger,
  triggerDetail: string,
  auditId:      string,
  processedAt:  string,
  overrides:    Overrides
): SafetyPipelineResult {
  return {
    disposition,
    trigger,
    triggerDetail,
    finalDecision: { disposition },
    overrides: { ...overrides },
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

// ── Test helper: exported for unit tests only ─────────────────────────────────
// Allows tests to assert that ORDERED_CHECKS has the expected priority sequence
// without re-sorting or depending on registration order.
export const _ORDERED_CHECK_NAMES = ORDERED_CHECKS.map(c => c.name);
