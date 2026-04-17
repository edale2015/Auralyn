# Disposition & Safety Core — Part B: Safety Pipeline & Escalation Guard

## Review Prompt

Continue reviewing the safety core (Part B — MOST CRITICAL CONTINUED).
Focus on: safetyPipeline logic gaps, escalation guard reliability,
how failures in Part A (finalDecisionEngine, hallucinationExtensions) propagate here,
and whether this layer can be bypassed by a dangerous case that passed Part A.

## Files

---

### server/clinical/safetyGate.ts

```ts
import { auditLog } from "../security/auditLogger";

// ── Threshold configuration ───────────────────────────────────────────────────
//
// In production, thresholds must be loaded from the safety_configs table via
// safetyConfigService.getActiveSafetyConfig() so every change is versioned,
// authorized, and auditable under FDA 21 CFR Part 11.
//
// DEFAULT_CONFIG is kept as the absolute fallback for local dev and unit tests.
// callers in production should always pass a DB-loaded config.

export interface SafetyGateConfig {
  riskThreshold:        number;
  hardStopThreshold:    number;
  uncertaintyThreshold: number;
  configVersion:        string;
}

export const DEFAULT_SAFETY_CONFIG: SafetyGateConfig = {
  riskThreshold:        0.6,
  hardStopThreshold:    0.95,
  uncertaintyThreshold: 0.3,
  configVersion:        "1.0.0",
};

export interface SafetyGateInput {
  riskScore:   number;
  uncertainty?: number;
  action?:     string;
  patientId?:  string;
  actorId?:    string;
}

export interface SafetyGateResult {
  allowed:         boolean;
  reason:          string;
  requiredAction?: "physician_review" | "confidence_boost" | "hard_stop" | "input_error";
  configVersion:   string;
}

// ── clinicalSafetyGate ────────────────────────────────────────────────────────
//
// FAIL-CLOSED: any exception, invalid input, or unrecognized state blocks.
// Never returns allowed:true unless all checks explicitly pass.
// Callers must treat a thrown exception the same as allowed:false.
//
// FIXED vs original:
//  1. No input validation — NaN, -0.5, Infinity silently passed. Fixed.
//  2. No try/catch — auditLog throwing (DB down) caused unhandled exception
//     that may have caused fail-open depending on caller. Fixed.
//  3. Magic numbers in source — thresholds now in SafetyGateConfig with
//     configVersion for audit trail. Fixed.
//  4. Missing "input_error" requiredAction — callers had no way to distinguish
//     invalid input from a real clinical block. Fixed.
//  5. result.reason was sometimes undefined — now always a non-empty string.

export function clinicalSafetyGate(
  decision: SafetyGateInput,
  config: SafetyGateConfig = DEFAULT_SAFETY_CONFIG,
): SafetyGateResult {
  try {
    const { riskScore, uncertainty = 0, patientId, actorId, action } = decision;
    const actor = actorId ?? "system";
    const cv    = config.configVersion;

    // ── Config sanity check ───────────────────────────────────────────────────
    // Misconfigured thresholds must be caught here, not discovered during a
    // patient's hard-stop event. Throw so the caller gets an immediate error.
    if (config.riskThreshold >= config.hardStopThreshold) {
      throw new Error(
        `SafetyGate misconfiguration: riskThreshold (${config.riskThreshold}) ` +
        `must be strictly less than hardStopThreshold (${config.hardStopThreshold})`
      );
    }

    // ── Input validation ──────────────────────────────────────────────────────
    // NaN >= 0.95 is false — NaN silently passed the old hard-stop check.
    // -0.5 < 0.6 is true — negative scores silently passed all checks.
    // Any non-finite or out-of-range value is a model/caller defect; block it.
    if (
      typeof riskScore !== "number" ||
      !isFinite(riskScore)          ||
      riskScore < 0                 ||
      riskScore > 1
    ) {
      try {
        auditLog({
          actor, action: "safety_gate_input_error", patientId,
          riskScore, details: { reason: "Invalid riskScore", input: action, configVersion: cv },
        });
      } catch { /* audit failure must not suppress the block */ }
      return {
        allowed: false,
        reason: `Invalid riskScore ${riskScore} — must be a finite number in [0, 1].`,
        requiredAction: "input_error",
        configVersion:  cv,
      };
    }

    if (
      typeof uncertainty !== "number" ||
      !isFinite(uncertainty)          ||
      uncertainty < 0                 ||
      uncertainty > 1
    ) {
      try {
        auditLog({
          actor, action: "safety_gate_input_error", patientId,
          riskScore, details: { reason: "Invalid uncertainty", uncertainty, input: action, configVersion: cv },
        });
      } catch { /* audit failure must not suppress the block */ }
      return {
        allowed: false,
        reason: `Invalid uncertainty ${uncertainty} — must be a finite number in [0, 1].`,
        requiredAction: "input_error",
        configVersion:  cv,
      };
    }

    // ── Hard stop — no physician override ─────────────────────────────────────
    if (riskScore >= config.hardStopThreshold) {
      try {
        auditLog({
          actor, action: "safety_gate_hard_stop", patientId, riskScore,
          details: { reason: "Extreme risk score", input: action, configVersion: cv },
        });
      } catch { /* audit failure must not suppress the block */ }
      return {
        allowed: false,
        reason:  "Extreme risk — hard stop. Immediate physician escalation required. No AI override permitted.",
        requiredAction: "hard_stop",
        configVersion:  cv,
      };
    }

    // ── Physician review required ─────────────────────────────────────────────
    if (riskScore > config.riskThreshold) {
      try {
        auditLog({
          actor, action: "safety_gate_blocked", patientId, riskScore,
          details: { reason: "Risk score exceeds threshold", input: action, configVersion: cv },
        });
      } catch { /* audit failure must not suppress the block */ }
      return {
        allowed: false,
        reason:  `Risk score ${riskScore.toFixed(3)} exceeds threshold ${config.riskThreshold}. Physician review required.`,
        requiredAction: "physician_review",
        configVersion:  cv,
      };
    }

    // ── Uncertainty too high ──────────────────────────────────────────────────
    if (uncertainty > config.uncertaintyThreshold) {
      try {
        auditLog({
          actor, action: "safety_gate_blocked", patientId, riskScore,
          details: { reason: "Model uncertainty too high", uncertainty, input: action, configVersion: cv },
        });
      } catch { /* audit failure must not suppress the block */ }
      return {
        allowed: false,
        reason:  `Model uncertainty ${uncertainty.toFixed(3)} exceeds threshold ${config.uncertaintyThreshold}. Additional data required.`,
        requiredAction: "confidence_boost",
        configVersion:  cv,
      };
    }

    // ── All checks passed ─────────────────────────────────────────────────────
    try {
      auditLog({
        actor, action: "safety_gate_passed", patientId, riskScore,
        details: { uncertainty, input: action, configVersion: cv },
      });
    } catch { /* audit failure must not suppress a valid pass */ }

    return {
      allowed: true,
      reason:  "All safety checks passed.",
      configVersion: cv,
    };

  } catch (err) {
    // ── Fail closed on any unhandled exception ────────────────────────────────
    // An exception in the gate itself (e.g. misconfigured thresholds, unexpected
    // throw from auditLog) must result in a block, never a pass.
    try {
      auditLog({
        actor:    decision.actorId ?? "system",
        action:   "safety_gate_exception",
        patientId: decision.patientId,
        riskScore: decision.riskScore,
        details:  { error: err instanceof Error ? err.message : String(err) },
      });
    } catch {
      console.error("[SafetyGate] CRITICAL: audit log failed during exception handler", err);
    }
    return {
      allowed: false,
      reason:  "Safety gate internal error. Decision blocked as a precaution.",
      requiredAction: "physician_review",
      configVersion:  DEFAULT_SAFETY_CONFIG.configVersion,
    };
  }
}

// ── Batch variant ─────────────────────────────────────────────────────────────
// Each call is independent and fail-closed. A single bad input does not affect
// the others — each result carries its own allowed/blocked status.

export function batchSafetyCheck(
  decisions: SafetyGateInput[],
  config: SafetyGateConfig = DEFAULT_SAFETY_CONFIG,
): SafetyGateResult[] {
  return decisions.map(d => clinicalSafetyGate(d, config));
}
```

### server/clinical/safetyPipeline.ts

```ts
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
```

### server/clinical/safetyEscalationGuard.ts

```ts
/**
 * safetyEscalationGuard.ts
 * Global safety override — the final guardrail before output leaves the brain.
 *
 * No matter what the individual engines returned, this guard enforces hard
 * clinical safety rules that cannot be bypassed:
 *
 *   Rule 1: riskScore > 0.85 → disposition = "ER_NOW"
 *   Rule 2: critical red flag keywords → disposition = "ER_NOW"
 *   Rule 3: multiple critical oversight alerts → physician_required
 *   Rule 4: governance not approved + high uncertainty → physician_required
 *   Rule 5: chief resident escalation → physician_required
 *
 * This is the equivalent of the senior consultant stepping in and overriding
 * an AI decision that fails a sanity check.
 */

export interface SafetyGuardInput {
  disposition?:          string;
  riskScore?:            number | null;
  riskLevel?:            string;
  redFlags?:             string[];
  oversightAlerts?:      { severity: string; type: string }[];
  governanceApproved?:   boolean;
  uncertainty?:          number;
  chiefResidentEscalated?: boolean;
}

export interface SafetyGuardOutput {
  disposition:      string;
  overridden:       boolean;
  overrideReasons:  string[];
}

const CRITICAL_RED_FLAG_PATTERNS = [
  /chest\s*pain/i,
  /stroke/i,
  /seizure/i,
  /anaphylaxis/i,
  /septic\s*shock/i,
  /respiratory\s*failure/i,
  /suicid/i,
  /cardi[ao]genic\s*shock/i,
  /altered\s*mental\s*status/i,
  /unconscious/i,
  /unresponsive/i,
];

export function runSafetyEscalationGuard(input: SafetyGuardInput): SafetyGuardOutput {
  const reasons: string[] = [];
  let disposition = input.disposition ?? "physician_required";

  if ((input.riskScore ?? 0) > 0.85) {
    reasons.push(`Risk score ${input.riskScore?.toFixed(2)} exceeds hard threshold 0.85`);
    disposition = "ER_NOW";
  }

  if (input.riskLevel === "high" && (input.riskScore ?? 0) > 0.75) {
    reasons.push("High risk level with elevated risk score");
    disposition = "ER_NOW";
  }

  const redFlagsText = (input.redFlags ?? []).join(" ");
  const criticalFlag = CRITICAL_RED_FLAG_PATTERNS.find((p) => p.test(redFlagsText));
  if (criticalFlag) {
    reasons.push(`Critical red flag pattern detected: ${criticalFlag.source}`);
    disposition = "ER_NOW";
  }

  const highOversightAlerts = (input.oversightAlerts ?? []).filter(
    (a) => a.severity === "high",
  );
  if (highOversightAlerts.length >= 2) {
    reasons.push(`${highOversightAlerts.length} high-severity oversight alerts`);
    if (disposition !== "ER_NOW") disposition = "physician_required";
  }

  if (!input.governanceApproved && (input.uncertainty ?? 0) > 0.7) {
    reasons.push("Governance not approved with high uncertainty");
    if (disposition !== "ER_NOW") disposition = "physician_required";
  }

  if (input.chiefResidentEscalated) {
    reasons.push("Chief resident reflection escalated");
    if (disposition !== "ER_NOW") disposition = "physician_required";
  }

  return {
    disposition,
    overridden:      reasons.length > 0,
    overrideReasons: reasons,
  };
}
```
