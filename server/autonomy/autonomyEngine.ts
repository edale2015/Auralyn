import type { SafetyGateResult } from "../safety/safetyGate";

export type AutonomyMode = "AUTO" | "REVIEW" | "ESCALATE";

export interface AutonomyDecision {
  mode: AutonomyMode;
  reason: string;
}

const AUTO_CONFIDENCE_THRESHOLD = 0.9;
const UNCERTAINTY_CAP = 0.2;

export function autonomyDecision({
  safety,
  confidence,
  uncertainty = 0,
}: {
  safety: SafetyGateResult;
  confidence: number;
  uncertainty?: number;
}): AutonomyDecision {
  if (safety.level === "HIGH" || !safety.allowed) {
    return {
      mode: "ESCALATE",
      reason: `Safety level HIGH: ${safety.reasons.slice(0, 2).join("; ")}`,
    };
  }

  if (uncertainty > UNCERTAINTY_CAP) {
    return {
      mode: "REVIEW",
      reason: `Uncertainty ${(uncertainty * 100).toFixed(0)}% exceeds threshold — routing to physician`,
    };
  }

  if (confidence >= AUTO_CONFIDENCE_THRESHOLD && safety.level === "LOW") {
    return {
      mode: "AUTO",
      reason: `Confidence ${(confidence * 100).toFixed(0)}% with LOW risk — autonomous discharge`,
    };
  }

  return {
    mode: "REVIEW",
    reason: `Confidence ${(confidence * 100).toFixed(0)}% below auto-threshold — routing to physician`,
  };
}
