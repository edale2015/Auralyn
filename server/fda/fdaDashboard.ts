/**
 * FDA Dashboard — running accuracy tracking for SaMD compliance.
 * Records validation results and exposes aggregated metrics.
 * Complements fdaValidator.ts which handles per-batch validation.
 */

interface ValidationEntry {
  correct:     boolean;
  disposition: string;
  risk:        "high" | "low";
  recordedAt:  string;
}

let stats = {
  total:   0,
  correct: 0,
};

const history: ValidationEntry[] = [];

export function recordValidation(result: { correct: boolean; disposition?: string; risk?: string }): void {
  stats.total++;
  if (result.correct) stats.correct++;

  history.push({
    correct:     result.correct,
    disposition: result.disposition ?? "unknown",
    risk:        (result.risk === "high" ? "high" : "low"),
    recordedAt:  new Date().toISOString(),
  });

  // Keep last 1000 entries in memory
  if (history.length > 1000) history.shift();
}

export function validateCase(result: { disposition?: string }, expected: { disposition?: string }): { correct: boolean; risk: "high" | "low" } {
  const correct = result.disposition === expected.disposition;
  const risk: "high" | "low" = result.disposition === "ER" || result.disposition === "physician_review_required" ? "high" : "low";
  const entry = { correct, risk };
  recordValidation({ ...entry, disposition: result.disposition });
  return entry;
}

export function getFDAMetrics() {
  const accuracy = stats.total > 0 ? stats.correct / stats.total : 0;
  const recentHistory = history.slice(-50);
  const recentAccuracy = recentHistory.length
    ? recentHistory.filter((h) => h.correct).length / recentHistory.length
    : 0;

  return {
    accuracy:       Number(accuracy.toFixed(4)),
    recentAccuracy: Number(recentAccuracy.toFixed(4)),
    totalCases:     stats.total,
    correctCases:   stats.correct,
    status:         accuracy >= 0.8 ? "PASS" : accuracy >= 0.72 ? "REVIEW" : "FAIL",
  };
}

export function resetFDAStats(): void {
  stats = { total: 0, correct: 0 };
  history.length = 0;
}
