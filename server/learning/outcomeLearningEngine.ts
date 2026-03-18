export interface OutcomeEntry {
  packId: string;
  caseId?: string;
  predictedDiagnosis: string;
  actualDiagnosis: string;
  correct: boolean;
  timestamp: string;
}

const outcomeMemory: OutcomeEntry[] = [];

export function logOutcome(entry: Omit<OutcomeEntry, "timestamp">): OutcomeEntry {
  const full: OutcomeEntry = {
    ...entry,
    timestamp: new Date().toISOString(),
  };
  outcomeMemory.push(full);
  return full;
}

export interface PackInsight {
  correct: number;
  incorrect: number;
  accuracy: number;
  total: number;
  lastUpdated: string;
}

export function learnFromOutcomes(): Record<string, PackInsight> {
  const insights: Record<string, PackInsight> = {};

  for (const entry of outcomeMemory) {
    const key = entry.packId;

    if (!insights[key]) {
      insights[key] = { correct: 0, incorrect: 0, accuracy: 0, total: 0, lastUpdated: "" };
    }

    if (entry.correct) {
      insights[key].correct++;
    } else {
      insights[key].incorrect++;
    }

    insights[key].total = insights[key].correct + insights[key].incorrect;
    insights[key].accuracy =
      insights[key].total > 0
        ? Math.round((insights[key].correct / insights[key].total) * 1000) / 10
        : 0;
    insights[key].lastUpdated = entry.timestamp;
  }

  return insights;
}

export function getOutcomeCount(): number {
  return outcomeMemory.length;
}

export function getRecentOutcomes(limit = 50): OutcomeEntry[] {
  return outcomeMemory.slice(-limit);
}

export function clearOutcomes(): void {
  outcomeMemory.length = 0;
}
