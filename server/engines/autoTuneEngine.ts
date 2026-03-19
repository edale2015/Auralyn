export interface Outcome {
  packId: string;
  predictedDisposition: string;
  actualDisposition: string;
  answers: any;
  correct: boolean;
  timestamp?: string;
}

const outcomeStore: Outcome[] = [];

export function logAutoTuneOutcome(o: Omit<Outcome, "timestamp">): Outcome {
  const entry: Outcome = { ...o, timestamp: new Date().toISOString() };
  outcomeStore.push(entry);
  return entry;
}

export interface FailurePattern {
  count: number;
  mismatches: Array<{ predicted: string; actual: string }>;
  failureRate?: number;
}

export function analyzeFailures(): Record<string, FailurePattern> {
  const totals: Record<string, number> = {};
  const patterns: Record<string, FailurePattern> = {};

  for (const o of outcomeStore) {
    totals[o.packId] = (totals[o.packId] || 0) + 1;

    if (!o.correct) {
      if (!patterns[o.packId]) {
        patterns[o.packId] = { count: 0, mismatches: [] };
      }
      patterns[o.packId].count++;
      patterns[o.packId].mismatches.push({
        predicted: o.predictedDisposition,
        actual: o.actualDisposition,
      });
    }
  }

  for (const [packId, pattern] of Object.entries(patterns)) {
    pattern.failureRate = totals[packId]
      ? Math.round((pattern.count / totals[packId]) * 1000) / 10
      : 0;
  }

  return patterns;
}

export interface RuleSuggestion {
  packId: string;
  severity: "low" | "medium" | "high";
  suggestion: string;
  failureCount: number;
  failureRate?: number;
  topMismatch?: { predicted: string; actual: string; count: number };
}

export function suggestRuleChanges(patterns: Record<string, FailurePattern>): RuleSuggestion[] {
  const suggestions: RuleSuggestion[] = [];

  for (const [packId, data] of Object.entries(patterns)) {
    const mismatchCounts: Record<string, number> = {};
    for (const m of data.mismatches) {
      const key = `${m.predicted}→${m.actual}`;
      mismatchCounts[key] = (mismatchCounts[key] || 0) + 1;
    }

    const topKey = Object.entries(mismatchCounts).sort((a, b) => b[1] - a[1])[0];
    const topMismatch = topKey
      ? { predicted: topKey[0].split("→")[0], actual: topKey[0].split("→")[1], count: topKey[1] }
      : undefined;

    if (data.count > 10) {
      suggestions.push({
        packId,
        severity: "high",
        suggestion: `Critical: ${data.count} failures detected. Top mismatch: ${topMismatch?.predicted} → ${topMismatch?.actual}. Consider rewriting scoring rules for this pack.`,
        failureCount: data.count,
        failureRate: data.failureRate,
        topMismatch,
      });
    } else if (data.count > 5) {
      suggestions.push({
        packId,
        severity: "medium",
        suggestion: `Warning: ${data.count} misclassifications. Consider adding escalation rule for frequent misclassification pattern.`,
        failureCount: data.count,
        failureRate: data.failureRate,
        topMismatch,
      });
    } else if (data.count > 0) {
      suggestions.push({
        packId,
        severity: "low",
        suggestion: `Minor: ${data.count} failures observed. Monitor for developing pattern.`,
        failureCount: data.count,
        failureRate: data.failureRate,
        topMismatch,
      });
    }
  }

  return suggestions.sort((a, b) => b.failureCount - a.failureCount);
}

export function getOutcomeStoreSize(): number {
  return outcomeStore.length;
}

export function clearOutcomeStore(): void {
  outcomeStore.length = 0;
}
