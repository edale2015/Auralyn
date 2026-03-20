import type { FDAMetrics } from "./metricsEngine";
import type { ValidationResult } from "./validationRunner";
import fs from "fs";
import path from "path";

export interface FDAReport {
  summary: string;
  version: string;
  generatedAt: string;
  metrics: FDAMetrics;
  sampleResults: ValidationResult[];
  totalCases: number;
  recommendation: string;
}

export function generateFDAReport(
  metrics: FDAMetrics,
  results: ValidationResult[]
): FDAReport {
  const recommendation =
    metrics.passesThreshold
      ? "PASS — System meets FDA SaMD performance threshold. Suitable for submission."
      : `FAIL — Accuracy ${(metrics.accuracy * 100).toFixed(1)}% below required ${(metrics.threshold * 100).toFixed(0)}%. Remediation required before submission.`;

  const report: FDAReport = {
    summary: "Auralyn Clinical AI — FDA SaMD Validation Report",
    version: "1.0.0",
    generatedAt: new Date().toISOString(),
    metrics,
    sampleResults: results.slice(0, 20),
    totalCases: results.length,
    recommendation,
  };

  try {
    const reportPath = path.join(process.cwd(), "fda_report.json");
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  } catch {
  }

  return report;
}
