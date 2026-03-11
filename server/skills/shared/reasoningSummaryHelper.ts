export function buildReasoningSummary(params: {
  skillName: string;
  headline: string;
  matchedRules?: string[];
  missingData?: string[];
  confidence?: number;
}): string {
  const bits = [params.headline];

  if (params.matchedRules?.length) {
    bits.push(`Matched rules: ${params.matchedRules.slice(0, 5).join(", ")}`);
  }

  if (params.missingData?.length) {
    bits.push(`Missing data: ${params.missingData.slice(0, 5).join(", ")}`);
  }

  if (typeof params.confidence === "number") {
    bits.push(`Confidence ${params.confidence.toFixed(2)}`);
  }

  return bits.join(". ");
}
