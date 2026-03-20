export interface OutcomeEntry {
  packId: string;
  caseId?: string;
  predictedDiagnosis: string;
  actualDiagnosis: string;
  correct: boolean;
  timestamp: Date;
}

export interface PackInsight {
  packId: string;
  accuracy: number;
  totalCases: number;
  correctCases: number;
}

const outcomes: OutcomeEntry[] = [];

export function logOutcome(entry: Omit<OutcomeEntry, "timestamp">): OutcomeEntry {
  const record: OutcomeEntry = { ...entry, timestamp: new Date() };
  outcomes.push(record);
  if (outcomes.length > 1000) outcomes.shift();
  return record;
}

export function learnFromOutcomes(): Record<string, PackInsight> {
  const byPack: Record<string, OutcomeEntry[]> = {};
  for (const o of outcomes) {
    if (!byPack[o.packId]) byPack[o.packId] = [];
    byPack[o.packId].push(o);
  }

  const insights: Record<string, PackInsight> = {};
  for (const [packId, entries] of Object.entries(byPack)) {
    const correct = entries.filter(e => e.correct).length;
    insights[packId] = {
      packId,
      totalCases: entries.length,
      correctCases: correct,
      accuracy: correct / (entries.length || 1),
    };
  }
  return insights;
}

export function getOutcomeCount(): number {
  return outcomes.length;
}

export function getRecentOutcomes(limit = 50): OutcomeEntry[] {
  return outcomes.slice(-limit);
}

export function clearOutcomes(): void {
  outcomes.length = 0;
}
