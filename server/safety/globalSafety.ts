export interface RiskPayload {
  systemRisk: number;
  malpracticeRisk?: number;
  reason?: string;
  caseId?: string;
}

export interface EscalationEvent {
  type: "FORCED_ESCALATION";
  reason: string;
  risk: RiskPayload;
  triggeredAt: string;
}

const SYSTEM_RISK_THRESHOLD = 0.8;
const MALPRACTICE_RISK_THRESHOLD = 0.7;

export function enforceGlobalSafety(risk: RiskPayload): void {
  const reasons: string[] = [];

  if (risk.systemRisk >= SYSTEM_RISK_THRESHOLD) {
    reasons.push(
      `System risk ${(risk.systemRisk * 100).toFixed(0)}% exceeds critical threshold (${SYSTEM_RISK_THRESHOLD * 100}%)`
    );
  }

  if ((risk.malpracticeRisk ?? 0) >= MALPRACTICE_RISK_THRESHOLD) {
    reasons.push(
      `Malpractice risk ${((risk.malpracticeRisk ?? 0) * 100).toFixed(0)}% exceeds critical threshold (${MALPRACTICE_RISK_THRESHOLD * 100}%)`
    );
  }

  if (reasons.length > 0) {
    const event: EscalationEvent = {
      type: "FORCED_ESCALATION",
      reason: reasons.join("; "),
      risk,
      triggeredAt: new Date().toISOString(),
    };
    console.error(
      `[GlobalSafety] FORCED_ESCALATION triggered for case ${risk.caseId ?? "unknown"}: ${event.reason}`
    );
    throw event;
  }
}

export function isForcedEscalation(e: unknown): e is EscalationEvent {
  return (
    typeof e === "object" &&
    e !== null &&
    (e as any).type === "FORCED_ESCALATION"
  );
}
