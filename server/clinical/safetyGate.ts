import { auditLog } from "../security/auditLogger";

export interface SafetyGateInput {
  riskScore: number;
  uncertainty?: number;
  action?: string;
  patientId?: string;
  actorId?: string;
}

export interface SafetyGateResult {
  allowed: boolean;
  reason?: string;
  requiredAction?: "physician_review" | "confidence_boost" | "hard_stop";
}

const RISK_THRESHOLD = 0.6;
const UNCERTAINTY_THRESHOLD = 0.3;
const HARD_STOP_THRESHOLD = 0.95;

export function clinicalSafetyGate(decision: SafetyGateInput): SafetyGateResult {
  if (decision.riskScore >= HARD_STOP_THRESHOLD) {
    auditLog({
      actor: decision.actorId ?? "system",
      action: "safety_gate_hard_stop",
      patientId: decision.patientId,
      riskScore: decision.riskScore,
      details: { reason: "Extreme risk score — hard stop" },
    });
    return {
      allowed: false,
      reason: "Extreme risk — hard stop. Immediate physician escalation required.",
      requiredAction: "hard_stop",
    };
  }

  if (decision.riskScore > RISK_THRESHOLD) {
    auditLog({
      actor: decision.actorId ?? "system",
      action: "safety_gate_blocked",
      patientId: decision.patientId,
      riskScore: decision.riskScore,
      details: { reason: "Risk score exceeds threshold" },
    });
    return {
      allowed: false,
      reason: "Requires physician review",
      requiredAction: "physician_review",
    };
  }

  if ((decision.uncertainty ?? 0) > UNCERTAINTY_THRESHOLD) {
    auditLog({
      actor: decision.actorId ?? "system",
      action: "safety_gate_blocked",
      patientId: decision.patientId,
      riskScore: decision.riskScore,
      details: { reason: "Uncertainty too high", uncertainty: decision.uncertainty },
    });
    return {
      allowed: false,
      reason: "Low confidence — additional data required",
      requiredAction: "confidence_boost",
    };
  }

  auditLog({
    actor: decision.actorId ?? "system",
    action: "safety_gate_passed",
    patientId: decision.patientId,
    riskScore: decision.riskScore,
  });

  return { allowed: true };
}

export function batchSafetyCheck(decisions: SafetyGateInput[]): SafetyGateResult[] {
  return decisions.map(clinicalSafetyGate);
}
