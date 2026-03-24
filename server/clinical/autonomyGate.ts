import { auditLog } from "../security/auditLogger";
import { logMetric } from "../monitoring/metrics";

export interface AutonomyCheckInput {
  riskScore?: number;
  uncertainty?: number;
  overallRisk?: string;
  recommendation?: string;
  workflow?: any;
  patientId?: string;
}

export interface AutonomyGateResult {
  allowed: boolean;
  reason: string;
  requiredAction?: "physician_review" | "more_data" | "none";
}

const MAX_RISK = 0.25;
const MAX_UNCERTAINTY = 0.2;

export function allowAutonomy(decision: AutonomyCheckInput): boolean {
  if ((decision.riskScore ?? 0) > MAX_RISK) return false;
  if ((decision.uncertainty ?? 0) > MAX_UNCERTAINTY) return false;
  if (decision.overallRisk === "high" || decision.overallRisk === "moderate") return false;
  return true;
}

export function checkAutonomy(decision: AutonomyCheckInput): AutonomyGateResult {
  const riskScore = decision.riskScore ?? 0;
  const uncertainty = decision.uncertainty ?? 0;

  if (riskScore > MAX_RISK) {
    logMetric("autonomy_gate.blocked.risk", riskScore, "safety");
    auditLog({
      actor: "autonomy_gate",
      action: "autonomy_blocked_high_risk",
      patientId: decision.patientId,
      riskScore,
    });
    return {
      allowed: false,
      reason: `Risk score ${riskScore.toFixed(2)} exceeds autonomy threshold ${MAX_RISK}`,
      requiredAction: "physician_review",
    };
  }

  if (uncertainty > MAX_UNCERTAINTY) {
    logMetric("autonomy_gate.blocked.uncertainty", uncertainty, "safety");
    return {
      allowed: false,
      reason: `Uncertainty ${uncertainty.toFixed(2)} too high for autonomous execution`,
      requiredAction: "more_data",
    };
  }

  if (decision.overallRisk === "moderate" || decision.overallRisk === "high") {
    return {
      allowed: false,
      reason: `Risk level "${decision.overallRisk}" requires physician oversight`,
      requiredAction: "physician_review",
    };
  }

  logMetric("autonomy_gate.allowed", 1, "safety");
  auditLog({ actor: "autonomy_gate", action: "autonomy_approved", patientId: decision.patientId, riskScore });

  return { allowed: true, reason: "Within safe autonomy envelope", requiredAction: "none" };
}
