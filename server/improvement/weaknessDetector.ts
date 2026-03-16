export type WeaknessSeverity = "critical" | "high" | "moderate" | "low";

export interface WeaknessDetection {
  type: string;
  severity: WeaknessSeverity;
  metric: string;
  value: number;
  threshold: number;
  description: string;
}

export function detectWeakAreas(simulationSummary: any): WeaknessDetection[] {
  const weaknesses: WeaknessDetection[] = [];

  if (simulationSummary.redFlagMissRate > 0.02) {
    weaknesses.push({
      type: "red_flag_detection",
      severity: "critical",
      metric: "redFlagMissRate",
      value: simulationSummary.redFlagMissRate,
      threshold: 0.02,
      description: `Red flag miss rate ${(simulationSummary.redFlagMissRate * 100).toFixed(1)}% exceeds safety threshold of 2%`,
    });
  }

  if (simulationSummary.dispositionAccuracy < 0.9) {
    weaknesses.push({
      type: "triage_accuracy",
      severity: simulationSummary.dispositionAccuracy < 0.75 ? "high" : "moderate",
      metric: "dispositionAccuracy",
      value: simulationSummary.dispositionAccuracy,
      threshold: 0.9,
      description: `Disposition accuracy ${(simulationSummary.dispositionAccuracy * 100).toFixed(1)}% below target of 90%`,
    });
  }

  if (simulationSummary.diagnosisAccuracy < 0.75) {
    weaknesses.push({
      type: "diagnostic_reasoning",
      severity: "moderate",
      metric: "diagnosisAccuracy",
      value: simulationSummary.diagnosisAccuracy,
      threshold: 0.75,
      description: `Diagnosis accuracy ${(simulationSummary.diagnosisAccuracy * 100).toFixed(1)}% below target of 75%`,
    });
  }

  if (simulationSummary.avgScore < 70) {
    weaknesses.push({
      type: "overall_score",
      severity: "low",
      metric: "avgScore",
      value: simulationSummary.avgScore,
      threshold: 70,
      description: `Average simulation score ${simulationSummary.avgScore.toFixed(1)} below target of 70`,
    });
  }

  return weaknesses;
}
