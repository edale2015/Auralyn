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
