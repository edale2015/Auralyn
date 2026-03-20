import type { SafetyGateResult } from "../safety/safetyGate";

export type AutonomyMode = "AUTO" | "REVIEW" | "ESCALATE";

export interface AutonomyDecision {
  mode: AutonomyMode;
  reason: string;
}

const BASE_AUTO_THRESHOLD = 0.9;
const UNCERTAINTY_CAP = 0.2;

let dynamicThreshold = BASE_AUTO_THRESHOLD;

export function setLoadAwareThreshold(queueDepth: number, errorRate: number): void {
  const highLoad = queueDepth > 500 || errorRate > 0.15;
  const criticalLoad = queueDepth > 800 || errorRate > 0.25;
  if (criticalLoad) {
    dynamicThreshold = 0.97;
  } else if (highLoad) {
    dynamicThreshold = 0.95;
  } else {
    dynamicThreshold = BASE_AUTO_THRESHOLD;
  }
}

export function getAutoThreshold(): number {
  return dynamicThreshold;
}

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

  if (confidence >= dynamicThreshold && safety.level === "LOW") {
    return {
      mode: "AUTO",
      reason: `Confidence ${(confidence * 100).toFixed(0)}% ≥ threshold ${(dynamicThreshold * 100).toFixed(0)}% with LOW risk — autonomous discharge`,
    };
  }

  return {
    mode: "REVIEW",
    reason: `Confidence ${(confidence * 100).toFixed(0)}% below auto-threshold ${(dynamicThreshold * 100).toFixed(0)}% — routing to physician`,
  };
}
