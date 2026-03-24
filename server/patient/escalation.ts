import { auditLog } from "../security/auditLogger";

export interface EscalationCheckInput {
  riskScore?: number;
  uncertainty?: number;
  overallRisk?: string;
  requiresPhysicianReview?: boolean;
  patientId?: string;
}

export interface EscalationResult {
  needsEscalation: boolean;
  priority: "immediate" | "urgent" | "routine" | "none";
  reason: string;
}

const RISK_THRESHOLD = 0.3;
const UNCERTAINTY_THRESHOLD = 0.25;

export function needsEscalation(result: EscalationCheckInput): boolean {
  if ((result.riskScore ?? 0) > RISK_THRESHOLD) return true;
  if ((result.uncertainty ?? 0) > UNCERTAINTY_THRESHOLD) return true;
  if (result.overallRisk === "high") return true;
  if (result.requiresPhysicianReview) return true;
  return false;
}

export function checkEscalation(result: EscalationCheckInput): EscalationResult {
  const riskScore = result.riskScore ?? 0;
  const uncertainty = result.uncertainty ?? 0;

  if (riskScore > 0.7 || result.overallRisk === "high") {
    auditLog({
      actor: "escalation_engine",
      action: "escalation_immediate",
      patientId: result.patientId,
      riskScore,
      details: { reason: "High risk score" },
    });
    return { needsEscalation: true, priority: "immediate", reason: "High risk — immediate physician review required" };
  }

  if (riskScore > RISK_THRESHOLD) {
    return { needsEscalation: true, priority: "urgent", reason: `Risk score ${riskScore.toFixed(2)} exceeds self-service threshold` };
  }

  if (uncertainty > UNCERTAINTY_THRESHOLD) {
    return { needsEscalation: true, priority: "routine", reason: `Uncertainty ${uncertainty.toFixed(2)} too high for autonomous action` };
  }

  if (result.requiresPhysicianReview) {
    return { needsEscalation: true, priority: "routine", reason: "Clinical scoring indicates physician review recommended" };
  }

  return { needsEscalation: false, priority: "none", reason: "Within self-service threshold" };
}
