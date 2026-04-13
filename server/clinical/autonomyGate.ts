/**
 * server/clinical/autonomyGate.ts — Clinical autonomy safety gate
 *
 * FIX (Code Review Issue #13):
 *   Previously: `decision.riskScore ?? 0` and `decision.uncertainty ?? 0` coalesced
 *   missing inputs to 0, which incorrectly authorized autonomous action when the
 *   safety signals were simply absent. A system with no risk data was treated as a
 *   zero-risk system — a silent under-triage that could harm patients.
 *
 *   Fixed: FAIL-CLOSED on absent safety inputs.
 *   - If riskScore is missing → deny autonomy, require more data
 *   - If uncertainty is missing → deny autonomy, require more data
 *   - Both must be present and within bounds to approve autonomous action
 *   - "Missing data" is audited separately from "out-of-bounds" for traceability
 */

import { auditLog } from "../security/auditLogger";
import { logMetric } from "../monitoring/metrics";

export interface AutonomyCheckInput {
  riskScore?:     number;
  uncertainty?:   number;
  overallRisk?:   string;
  recommendation?: string;
  workflow?:      any;
  patientId?:     string;
}

export interface AutonomyGateResult {
  allowed:         boolean;
  reason:          string;
  requiredAction?: "physician_review" | "more_data" | "none";
  /** Inputs that triggered the decision — for audit trail transparency */
  inputs: {
    riskScore:   number | null;
    uncertainty: number | null;
    overallRisk: string | null;
  };
}

const MAX_RISK        = 0.25;
const MAX_UNCERTAINTY = 0.20;

// ── allowAutonomy — simplified boolean check ──────────────────────────────────
// Preserves backward-compat signature; now also fail-closed on missing inputs.

export function allowAutonomy(decision: AutonomyCheckInput): boolean {
  return checkAutonomy(decision).allowed;
}

// ── checkAutonomy — full gated check with audit ───────────────────────────────

export function checkAutonomy(decision: AutonomyCheckInput): AutonomyGateResult {
  const inputRecord = {
    riskScore:   decision.riskScore   ?? null,
    uncertainty: decision.uncertainty ?? null,
    overallRisk: decision.overallRisk ?? null,
  };

  // ── FAIL-CLOSED: missing riskScore (Issue #13) ────────────────────────────
  if (decision.riskScore === undefined || decision.riskScore === null) {
    logMetric("autonomy_gate.blocked.missing_risk", 1, "safety");
    auditLog({
      actor:     "autonomy_gate",
      action:    "autonomy_blocked_missing_risk_score",
      patientId: decision.patientId,
      riskScore: null,
    });
    return {
      allowed:        false,
      reason:         "riskScore is required for autonomy approval — missing input treated as unsafe",
      requiredAction: "more_data",
      inputs:         inputRecord,
    };
  }

  // ── FAIL-CLOSED: missing uncertainty (Issue #13) ──────────────────────────
  if (decision.uncertainty === undefined || decision.uncertainty === null) {
    logMetric("autonomy_gate.blocked.missing_uncertainty", 1, "safety");
    auditLog({
      actor:     "autonomy_gate",
      action:    "autonomy_blocked_missing_uncertainty",
      patientId: decision.patientId,
      riskScore: decision.riskScore,
    });
    return {
      allowed:        false,
      reason:         "uncertainty is required for autonomy approval — missing input treated as unsafe",
      requiredAction: "more_data",
      inputs:         inputRecord,
    };
  }

  // ── Explicit safety checks (both values now confirmed present) ────────────

  const riskScore   = decision.riskScore;
  const uncertainty = decision.uncertainty;

  if (riskScore > MAX_RISK) {
    logMetric("autonomy_gate.blocked.risk", riskScore, "safety");
    auditLog({
      actor:     "autonomy_gate",
      action:    "autonomy_blocked_high_risk",
      patientId: decision.patientId,
      riskScore,
    });
    return {
      allowed:        false,
      reason:         `Risk score ${riskScore.toFixed(2)} exceeds autonomy threshold ${MAX_RISK}`,
      requiredAction: "physician_review",
      inputs:         inputRecord,
    };
  }

  if (uncertainty > MAX_UNCERTAINTY) {
    logMetric("autonomy_gate.blocked.uncertainty", uncertainty, "safety");
    auditLog({
      actor:     "autonomy_gate",
      action:    "autonomy_blocked_high_uncertainty",
      patientId: decision.patientId,
      riskScore,
    });
    return {
      allowed:        false,
      reason:         `Uncertainty ${uncertainty.toFixed(2)} too high for autonomous execution`,
      requiredAction: "more_data",
      inputs:         inputRecord,
    };
  }

  if (decision.overallRisk === "moderate" || decision.overallRisk === "high") {
    logMetric("autonomy_gate.blocked.overall_risk", 1, "safety");
    auditLog({
      actor:     "autonomy_gate",
      action:    "autonomy_blocked_overall_risk",
      patientId: decision.patientId,
      riskScore,
    });
    return {
      allowed:        false,
      reason:         `Risk level "${decision.overallRisk}" requires physician oversight`,
      requiredAction: "physician_review",
      inputs:         inputRecord,
    };
  }

  // ── Approved ──────────────────────────────────────────────────────────────

  logMetric("autonomy_gate.allowed", 1, "safety");
  auditLog({
    actor:     "autonomy_gate",
    action:    "autonomy_approved",
    patientId: decision.patientId,
    riskScore,
  });

  return {
    allowed:        true,
    reason:         `Within safe autonomy envelope (risk=${riskScore.toFixed(2)}, uncertainty=${uncertainty.toFixed(2)})`,
    requiredAction: "none",
    inputs:         inputRecord,
  };
}
