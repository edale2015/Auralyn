export type AdaptiveRecommendationInput = {
  safetyMode: "normal" | "elevated" | "strict";
  nextConfidenceThreshold: number;
  topCaseMixComplaint?: string;
  marginPct: number;
};

export function buildAdaptiveRecommendations(
  input: AdaptiveRecommendationInput
) {
  const out: string[] = [];

  if (input.safetyMode === "strict") {
    out.push("Activate temporary strict review mode across medium and high-risk queues");
    out.push("Increase physician sampling on weak complaint clusters");
  } else if (input.safetyMode === "elevated") {
    out.push("Maintain elevated review mode until drift and anomaly signals normalize");
  } else {
    out.push("System stable enough to optimize throughput in low-risk pathways");
  }

  if (input.nextConfidenceThreshold >= 0.85) {
    out.push("High approval threshold suggests current caution is warranted");
  } else if (input.nextConfidenceThreshold <= 0.72) {
    out.push("Approval threshold may be loosened selectively for low-risk complaints");
  }

  if (input.topCaseMixComplaint) {
    out.push(`Increase staffing and complaint-hardening attention for ${input.topCaseMixComplaint}`);
  }

  if (input.marginPct < 25) {
    out.push("Margin pressure detected. Reduce review friction for safe low-risk cases and inspect escalation costs");
  } else if (input.marginPct > 45) {
    out.push("Healthy margin profile. Reinvest into higher-quality follow-up and complaint calibration");
  }

  return out;
}
