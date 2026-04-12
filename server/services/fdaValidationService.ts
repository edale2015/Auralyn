import type { GoldenCaseRunResult } from "../types/clinical";

export interface FDAValidationReport {
  totalCases:          number;
  passed:              number;
  failed:              number;
  accuracy:            number;
  highRiskFailures:    number;
  criticalMisses:      string[];
  fdaReady:            boolean;
  readinessGrade:      "A" | "B" | "C" | "F";
  recommendations:     string[];
  generatedAt:         string;
}

class FDAValidationService {
  private readonly minAccuracyForReady = 0.8;
  private readonly targetAccuracy      = 0.95;

  generateReport(runs: GoldenCaseRunResult[]): FDAValidationReport {
    const total = runs.length;
    const passed = runs.filter((r) => r.passed).length;
    const failed = total - passed;
    const accuracy = total === 0 ? 0 : passed / total;

    // Any missed ED-now dispositions are critical
    const criticalMisses = runs
      .filter((r) => !r.passed && r.mismatches.some((m) => m.includes("ED now")))
      .map((r) => r.caseId);

    const highRiskFailures = criticalMisses.length;

    const fdaReady = accuracy >= this.minAccuracyForReady && highRiskFailures === 0;

    const readinessGrade: "A" | "B" | "C" | "F" =
      accuracy >= 0.95 && highRiskFailures === 0 ? "A" :
      accuracy >= 0.85 && highRiskFailures === 0 ? "B" :
      accuracy >= 0.75                            ? "C" : "F";

    const recommendations: string[] = [];
    if (accuracy < this.targetAccuracy) {
      recommendations.push(`Accuracy ${(accuracy * 100).toFixed(1)}% is below target 95%. Review failing cases and retrain.`);
    }
    if (highRiskFailures > 0) {
      recommendations.push(`${highRiskFailures} missed ED-now disposition(s) — critical patient safety gaps. Immediate remediation required.`);
    }
    if (total < 10) {
      recommendations.push("Golden case corpus is small (< 10 cases). Expand to improve statistical confidence.");
    }
    if (fdaReady) {
      recommendations.push("System meets FDA SaMD Class II validation threshold.");
    }

    return {
      totalCases:       total,
      passed,
      failed,
      accuracy,
      highRiskFailures,
      criticalMisses,
      fdaReady,
      readinessGrade,
      recommendations,
      generatedAt:      new Date().toISOString(),
    };
  }
}

export const fdaValidationService = new FDAValidationService();
