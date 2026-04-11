export type ConfidenceTier = "HIGH" | "MEDIUM" | "LOW";

export function calculateConfidence(probability: number): ConfidenceTier {
  if (probability > 0.8 || probability < 0.2) return "HIGH";
  if (probability > 0.6 || probability < 0.4) return "MEDIUM";
  return "LOW";
}

export function confidenceRationale(probability: number): string {
  const tier = calculateConfidence(probability);
  switch (tier) {
    case "HIGH":
      return probability > 0.8
        ? "High probability strongly supports treatment."
        : "Very low probability strongly argues against treatment.";
    case "MEDIUM":
      return "Intermediate probability — clinical judgement + testing recommended.";
    case "LOW":
      return "Near-threshold probability — decision is uncertain; use additional data.";
  }
}

export function isHighConfidence(probability: number): boolean {
  return calculateConfidence(probability) === "HIGH";
}

export function requiresAdditionalEvidence(probability: number): boolean {
  return calculateConfidence(probability) === "LOW";
}
