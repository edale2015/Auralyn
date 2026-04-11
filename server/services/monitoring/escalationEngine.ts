import type { RiskAlert } from "./riskGovernanceEngine";
import type { ConfidenceTier } from "../clinical/confidenceEngine";

export interface EscalationDecision {
  shouldEscalate: boolean;
  escalationReasons: string[];
  escalationLevel: "none" | "notify" | "urgent" | "immediate";
}

export function shouldEscalate(input: {
  riskAlerts: RiskAlert[];
  confidence: ConfidenceTier;
  centorScore?: number;
}): EscalationDecision {
  const reasons: string[] = [];

  const hasCritical = input.riskAlerts.some((a) => a.severity === "critical");
  const hasWarning  = input.riskAlerts.some((a) => a.severity === "warning");

  if (hasCritical) reasons.push("Critical risk alert triggered");
  if (hasWarning && input.confidence === "LOW") reasons.push("Warning + low confidence combination");
  if (input.confidence === "LOW" && !hasWarning && !hasCritical) reasons.push("Low confidence decision — additional evidence needed");
  if ((input.centorScore ?? 0) >= 4 && input.riskAlerts.some((a) => a.type === "under_treatment")) {
    reasons.push("Centor ≥4 with under-treatment risk");
  }

  let escalationLevel: EscalationDecision["escalationLevel"] = "none";
  if (hasCritical) escalationLevel = "immediate";
  else if (hasWarning && input.confidence === "LOW") escalationLevel = "urgent";
  else if (input.confidence === "LOW") escalationLevel = "notify";

  return {
    shouldEscalate: reasons.length > 0,
    escalationReasons: reasons,
    escalationLevel,
  };
}
