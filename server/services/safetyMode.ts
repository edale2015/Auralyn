export type SafetyModeInput = {
  driftDetected: boolean;
  anomalySeverity: "normal" | "watch" | "critical";
  overrideRate: number;
};

export type SafetyModeResult = {
  mode: "strict" | "elevated" | "normal";
  mandatoryReviewAllMediumAndHigh?: boolean;
  mandatoryReviewAllHigh?: boolean;
  batchApprovalEnabled: boolean;
};

export function determineSafetyMode(input: SafetyModeInput): SafetyModeResult {
  if (input.anomalySeverity === "critical" || input.overrideRate > 0.2) {
    return { mode: "strict", mandatoryReviewAllMediumAndHigh: true, batchApprovalEnabled: false };
  }
  if (input.driftDetected || input.anomalySeverity === "watch") {
    return { mode: "elevated", mandatoryReviewAllHigh: true, batchApprovalEnabled: true };
  }
  return { mode: "normal", mandatoryReviewAllHigh: true, batchApprovalEnabled: true };
}
