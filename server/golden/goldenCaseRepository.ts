import { eq, desc, and } from "drizzle-orm";
import { db } from "../db";
import {
  kbGoldenCases, goldenCaseRuns, goldenCaseCoverage,
  type KbGoldenCase, type GoldenCaseRun, type GoldenCaseCoverage,
  type InsertGoldenCaseRun, type InsertGoldenCaseCoverage,
} from "@shared/schema";
import { type GoldenCaseResult, type CoverageGap } from "./types";
import { logger } from "../utils/logger";

export async function listActiveGoldenCases(): Promise<KbGoldenCase[]> {
  return db
    .select()
    .from(kbGoldenCases)
    .where(eq(kbGoldenCases.active, true))
    .orderBy(kbGoldenCases.caseId);
}

export async function persistRunResults(
  results: GoldenCaseResult[],
  opts: { runBatch: string; systemVersion: string; engineVersion: string }
): Promise<void> {
  if (!results.length) return;

  const lookupMap = new Map<string, KbGoldenCase>();
  const allCases = await db.select().from(kbGoldenCases);
  for (const c of allCases) lookupMap.set(c.caseId, c);

  const rows: InsertGoldenCaseRun[] = results
    .map((r) => {
      const gc = lookupMap.get(r.caseId);
      if (!gc) return null;
      return {
        goldenCaseId: gc.id,
        runBatch: opts.runBatch,
        systemVersion: opts.systemVersion,
        engineVersion: opts.engineVersion,
        result: {
          expected: r.expected,
          actual: r.actual,
          failReasons: r.failReasons,
        } as Record<string, unknown>,
        score: r.score,
        passed: r.passed,
        failReason: r.failReasons.join("; ") || null,
      } satisfies InsertGoldenCaseRun;
    })
    .filter((r): r is InsertGoldenCaseRun => r !== null);

  if (rows.length) {
    await db.insert(goldenCaseRuns).values(rows);
  }
}

export async function getRunHistory(
  goldenCaseId: number,
  limit = 20
): Promise<GoldenCaseRun[]> {
  return db
    .select()
    .from(goldenCaseRuns)
    .where(eq(goldenCaseRuns.goldenCaseId, goldenCaseId))
    .orderBy(desc(goldenCaseRuns.runAt))
    .limit(limit);
}

export async function getLatestBatchResults(runBatch: string): Promise<GoldenCaseRun[]> {
  return db
    .select()
    .from(goldenCaseRuns)
    .where(eq(goldenCaseRuns.runBatch, runBatch))
    .orderBy(desc(goldenCaseRuns.runAt));
}

export async function upsertCoverageMatrix(
  complaint: string,
  riskBand: string,
  ageBand: string,
  count: number,
  targetCount = 3
): Promise<void> {
  try {
    const existing = await db
      .select()
      .from(goldenCaseCoverage)
      .where(
        and(
          eq(goldenCaseCoverage.complaint, complaint),
          eq(goldenCaseCoverage.riskBand, riskBand),
          eq(goldenCaseCoverage.ageBand, ageBand)
        )
      )
      .limit(1);

    if (existing[0]) {
      await db
        .update(goldenCaseCoverage)
        .set({ count, targetCount, updatedAt: new Date() })
        .where(eq(goldenCaseCoverage.id, existing[0].id));
    } else {
      await db.insert(goldenCaseCoverage).values({
        complaint,
        riskBand,
        ageBand,
        count,
        targetCount,
      } satisfies InsertGoldenCaseCoverage);
    }
  } catch (e: any) {
    logger.warn("[GoldenRepo] upsertCoverageMatrix error", { message: e?.message });
  }
}

export async function getCoverageGaps(): Promise<CoverageGap[]> {
  const rows = await db.select().from(goldenCaseCoverage);
  return rows
    .filter((r) => r.count < r.targetCount)
    .map((r) => ({
      complaint: r.complaint,
      riskBand: r.riskBand,
      ageBand: r.ageBand,
      current: r.count,
      target: r.targetCount,
      gap: r.targetCount - r.count,
    }));
}

export async function getCoverageMatrix(): Promise<GoldenCaseCoverage[]> {
  return db.select().from(goldenCaseCoverage).orderBy(goldenCaseCoverage.complaint);
}
