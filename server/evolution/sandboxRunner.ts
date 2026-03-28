import { runAllGoldenCases } from "../golden/goldenRunner";
import { computeMetrics } from "../fda/metricsEngine";
import { GOLDEN_CASES } from "../golden/goldenCases";

export interface SandboxResult {
  passRate: number;
  safetyAccuracy: number;
  f1Score: number;
  avgLatencyMs: number;
  totalCases: number;
  passedCases: number;
  failedCases: number;
  ranAt: string;
}

let lastSandboxResult: SandboxResult | null = null;

/**
 * Runs all golden cases and computes FDA-grade metrics.
 * This is the validation gate before any agent evolution is promoted.
 */
export async function runSandbox(_config?: any): Promise<SandboxResult> {
  const goldenResults = await runAllGoldenCases();

  const validationResults = goldenResults.map(r => ({
    input:     { caseId: r.caseId },
    predicted: r.matchedKeywords[0] ?? null,
    actual:    GOLDEN_CASES.find(g => g.id === r.caseId)?.expectedKeywords[0] ?? "unknown",
    correct:   r.passed,
    safety:    r.blocked ? "BLOCKED" : "ALLOWED",
    confidence: r.passed ? 1 : 0,
  }));

  const metrics = computeMetrics(validationResults);

  const safetyCorrect = goldenResults.filter(r => {
    const gc = GOLDEN_CASES.find(g => g.id === r.caseId);
    return gc && ((gc.mustBlock && r.blocked) || (!gc.mustBlock && !r.blocked));
  }).length;

  const passed    = goldenResults.filter(r => r.passed).length;
  const failed    = goldenResults.length - passed;
  const avgLatMs  = goldenResults.length > 0
    ? Math.round(goldenResults.reduce((s, r) => s + r.latencyMs, 0) / goldenResults.length)
    : 0;

  lastSandboxResult = {
    passRate:        Number((passed / Math.max(goldenResults.length, 1)).toFixed(4)),
    safetyAccuracy:  Number((safetyCorrect / Math.max(goldenResults.length, 1)).toFixed(4)),
    f1Score:         metrics.f1Score,
    avgLatencyMs:    avgLatMs,
    totalCases:      goldenResults.length,
    passedCases:     passed,
    failedCases:     failed,
    ranAt:           new Date().toISOString(),
  };

  return lastSandboxResult;
}

export function getLastSandboxResult(): SandboxResult | null {
  return lastSandboxResult;
}
