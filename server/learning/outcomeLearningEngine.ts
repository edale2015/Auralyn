import { db } from "../db";
import { outcomes as outcomesTable } from "../../shared/schema";
import { desc } from "drizzle-orm";

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

const outcomeLog: OutcomeEntry[] = [];

export function logOutcome(entry: Omit<OutcomeEntry, "timestamp">): OutcomeEntry {
  const record: OutcomeEntry = { ...entry, timestamp: new Date() };
  outcomeLog.push(record);
  if (outcomeLog.length > 1000) outcomeLog.shift();
  return record;
}

export function learnFromOutcomes(): Record<string, PackInsight> {
  const byPack: Record<string, OutcomeEntry[]> = {};
  for (const o of outcomeLog) {
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
  return outcomeLog.length;
}

export function getRecentOutcomes(limit = 50): OutcomeEntry[] {
  return outcomeLog.slice(-limit);
}

export function clearOutcomes(): void {
  outcomeLog.length = 0;
}

export async function seedOutcomesFromDB(): Promise<void> {
  try {
    if (outcomeLog.length > 0) return;
    const rows = await db
      .select()
      .from(outcomesTable)
      .orderBy(desc(outcomesTable.createdAt))
      .limit(500);

    let seeded = 0;
    for (const row of rows) {
      if (!row.predicted || !row.actual || row.actual === "pending") continue;
      const packId = (row.predicted ?? "unknown").split("-")[0] ?? "unknown";
      outcomeLog.push({
        packId,
        predictedDiagnosis: row.predicted,
        actualDiagnosis: row.actual,
        correct: row.predicted === row.actual,
        timestamp: row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt),
      });
      seeded++;
    }
    if (seeded > 0) {
      console.log(`[OutcomeLearning] Seeded ${seeded} historical outcomes from DB`);
    }
  } catch (e: any) {
    console.error("[OutcomeLearning] seedOutcomesFromDB error:", e?.message);
  }
}
