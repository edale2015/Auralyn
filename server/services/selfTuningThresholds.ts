export type ThresholdTuningInput = {
  currentConfidenceThreshold: number;
  recentOverrideRate: number;
  recentAccuracy: number;
};

export function tuneApprovalThreshold(input: ThresholdTuningInput) {
  let nextThreshold = input.currentConfidenceThreshold;
  if (input.recentOverrideRate > 0.15 || input.recentAccuracy < 0.8) {
    nextThreshold += 0.05;
  } else if (input.recentOverrideRate < 0.05 && input.recentAccuracy > 0.92) {
    nextThreshold -= 0.03;
  }
  nextThreshold = Math.max(0.6, Math.min(0.95, nextThreshold));
  return {
    currentConfidenceThreshold: input.currentConfidenceThreshold,
    nextConfidenceThreshold: Number(nextThreshold.toFixed(3)),
    action: nextThreshold > input.currentConfidenceThreshold ? "tightened" : nextThreshold < input.currentConfidenceThreshold ? "loosened" : "unchanged",
  };
}
