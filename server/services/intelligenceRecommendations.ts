export type IntelligenceInputs = {
  driftDetected: boolean;
  overrideRate: number;
  escalationRate: number;
  avgCostPerCase: number;
  anomalySeverity: "normal" | "watch" | "critical";
};

export function buildIntelligenceRecommendations(input: IntelligenceInputs): string[] {
  const recommendations: string[] = [];

  if (input.driftDetected) {
    recommendations.push("Require additional physician review for underperforming complaints and retrain confidence thresholds");
  }
  if (input.overrideRate > 0.15) {
    recommendations.push("High override rate detected. Review reasoning chains and complaint-specific question logic");
  }
  if (input.escalationRate > 0.1) {
    recommendations.push("Escalation rate elevated. Inspect routing delays, SLA thresholds, and red-flag gating");
  }
  if (input.avgCostPerCase > 10) {
    recommendations.push("Cost per case is high. Increase eligibility for batch approval on low-risk, high-confidence cases");
  }
  if (input.anomalySeverity === "critical") {
    recommendations.push("Critical anomaly detected. Activate safety mode and require mandatory review for affected cluster");
  }
  if (!recommendations.length) {
    recommendations.push("System stable. Continue monitoring and refine complaint calibration");
  }
  return recommendations;
}
