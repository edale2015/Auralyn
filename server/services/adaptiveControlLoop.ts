export type AdaptiveControlInput = {
  clinicId: string;
  driftDetected: boolean;
  anomalySeverity: "normal" | "watch" | "critical";
  recentOverrideRate: number;
  recentAccuracy: number;
  avgCostPerCase: number;
  escalationRate: number;
  currentConfidenceThreshold: number;
};

export type AdaptiveControlOutput = {
  clinicId: string;
  safetyMode: "normal" | "elevated" | "strict";
  nextConfidenceThreshold: number;
  routingPolicy: "balanced" | "quality_first" | "throughput_first";
  batchApprovalEnabled: boolean;
  mandatoryReviewHigh: boolean;
  mandatoryReviewMedium: boolean;
  recommendedActions: string[];
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function runAdaptiveControlLoop(
  input: AdaptiveControlInput
): AdaptiveControlOutput {
  let safetyMode: AdaptiveControlOutput["safetyMode"] = "normal";
  let routingPolicy: AdaptiveControlOutput["routingPolicy"] = "balanced";
  let batchApprovalEnabled = true;
  let mandatoryReviewHigh = true;
  let mandatoryReviewMedium = false;
  let nextConfidenceThreshold = input.currentConfidenceThreshold;
  const recommendedActions: string[] = [];

  if (input.anomalySeverity === "critical" || input.recentOverrideRate > 0.2) {
    safetyMode = "strict";
    routingPolicy = "quality_first";
    batchApprovalEnabled = false;
    mandatoryReviewMedium = true;
    nextConfidenceThreshold += 0.07;
    recommendedActions.push(
      "Critical safety posture activated",
      "Disable batch approvals temporarily",
      "Route more cases to top-ranked physicians"
    );
  } else if (
    input.driftDetected ||
    input.anomalySeverity === "watch" ||
    input.recentAccuracy < 0.8
  ) {
    safetyMode = "elevated";
    routingPolicy = "quality_first";
    batchApprovalEnabled = true;
    mandatoryReviewMedium = true;
    nextConfidenceThreshold += 0.04;
    recommendedActions.push(
      "Elevated review posture enabled",
      "Increase complaint-level audit sampling",
      "Tighten approval threshold modestly"
    );
  } else if (input.avgCostPerCase > 10 && input.recentAccuracy > 0.9) {
    safetyMode = "normal";
    routingPolicy = "throughput_first";
    batchApprovalEnabled = true;
    mandatoryReviewMedium = false;
    nextConfidenceThreshold -= 0.02;
    recommendedActions.push(
      "Cost optimization posture enabled",
      "Expand low-risk batch approval",
      "Route more low-risk cases to faster clinicians"
    );
  } else {
    recommendedActions.push("System stable");
  }

  if (input.escalationRate > 0.12) {
    recommendedActions.push("Review SLA thresholds and escalation triggers");
  }

  nextConfidenceThreshold = clamp(nextConfidenceThreshold, 0.6, 0.95);

  return {
    clinicId: input.clinicId,
    safetyMode,
    nextConfidenceThreshold: Number(nextConfidenceThreshold.toFixed(3)),
    routingPolicy,
    batchApprovalEnabled,
    mandatoryReviewHigh,
    mandatoryReviewMedium,
    recommendedActions
  };
}
