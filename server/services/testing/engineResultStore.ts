import type { EngineRunResult } from "./engineMassRunner";
import { getFirestore } from "firebase-admin/firestore";

export interface RunStats {
  accuracy: number;
  underTriageCount: number;
  overTriageCount: number;
  mismatchCount: number;
  matchCount: number;
  errorCount: number;
  underTriageRate: number;
  overTriageRate: number;
  dispositionBreakdown: Record<string, number>;
  avgDurationMs: number;
}

export interface TestRun {
  runId: string;
  complaintId: string;
  totalCases: number;
  results: EngineRunResult[];
  stats: RunStats;
  timestamp: string;
}

const SEVERITY_ORDER: Record<string, number> = {
  "SELF_CARE": 1,
  "HOME_CARE": 1,
  "TELEHEALTH": 2,
  "ROUTINE": 3,
  "URGENT_CARE": 4,
  "URGENT": 4,
  "EMERGENT": 5,
  "ER": 5,
  "ER_SEND": 5,
  "EMERGENT_ESCALATION": 6,
};

function severityOf(disp: string): number {
  return SEVERITY_ORDER[disp?.toUpperCase()] ?? 3;
}

function computeStats(results: EngineRunResult[]): RunStats {
  const dispositionBreakdown: Record<string, number> = {};
  let matchCount = 0;
  let underTriageCount = 0;
  let overTriageCount = 0;
  let mismatchCount = 0;
  let errorCount = 0;
  let totalDuration = 0;
  let comparableCount = 0;

  for (const r of results) {
    totalDuration += r.durationMs;

    if (r.error) {
      errorCount++;
      continue;
    }

    const disp = r.disposition || "UNKNOWN";
    dispositionBreakdown[disp] = (dispositionBreakdown[disp] || 0) + 1;

    if (r.expectedDisposition && r.disposition) {
      comparableCount++;
      const engineSev = severityOf(r.disposition);
      const expectedSev = severityOf(r.expectedDisposition);

      if (r.disposition === r.expectedDisposition || engineSev === expectedSev) {
        matchCount++;
      } else if (engineSev < expectedSev) {
        underTriageCount++;
        mismatchCount++;
      } else {
        overTriageCount++;
        mismatchCount++;
      }
    } else {
      comparableCount++;
      matchCount++;
    }
  }

  const accuracy = comparableCount > 0 ? matchCount / comparableCount : 0;
  const underTriageRate = comparableCount > 0 ? underTriageCount / comparableCount : 0;
  const overTriageRate = comparableCount > 0 ? overTriageCount / comparableCount : 0;

  return {
    accuracy,
    underTriageCount,
    overTriageCount,
    mismatchCount,
    matchCount,
    errorCount,
    underTriageRate,
    overTriageRate,
    dispositionBreakdown,
    avgDurationMs: results.length > 0 ? totalDuration / results.length : 0,
  };
}

function getCollection() {
  return getFirestore().collection("validation_runs");
}

export async function storeTestRun(complaintId: string, results: EngineRunResult[]): Promise<TestRun> {
  const stats = computeStats(results);
  const run: TestRun = {
    runId: `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    complaintId,
    totalCases: results.length,
    results,
    stats,
    timestamp: new Date().toISOString(),
  };

  try {
    await getCollection().doc(run.runId).set({
      runId: run.runId,
      complaintId: run.complaintId,
      totalCases: run.totalCases,
      stats: run.stats,
      timestamp: run.timestamp,
      resultsSummary: results.slice(0, 5).map(r => ({
        caseId: r.caseId,
        disposition: r.disposition,
        expectedDisposition: r.expectedDisposition,
        confidence: r.confidence,
        topDiagnosis: r.topDiagnosis,
      })),
    });

    const batchSize = 400;
    for (let i = 0; i < results.length; i += batchSize) {
      const batch = getFirestore().batch();
      const chunk = results.slice(i, i + batchSize);
      for (const r of chunk) {
        const docRef = getCollection().doc(run.runId).collection("results").doc(r.caseId);
        batch.set(docRef, r);
      }
      await batch.commit();
    }
  } catch (err) {
    console.error("[ValidationRuns] Firestore write failed, run kept in memory:", err);
  }

  return run;
}

export async function listTestRuns(): Promise<Omit<TestRun, "results">[]> {
  try {
    const snap = await getCollection().orderBy("timestamp", "desc").limit(50).get();
    return snap.docs.map(doc => {
      const d = doc.data();
      return {
        runId: d.runId,
        complaintId: d.complaintId,
        totalCases: d.totalCases,
        stats: d.stats,
        timestamp: d.timestamp,
      } as Omit<TestRun, "results">;
    });
  } catch {
    return [];
  }
}

export async function getTestRun(runId: string): Promise<TestRun | undefined> {
  try {
    const doc = await getCollection().doc(runId).get();
    if (!doc.exists) return undefined;
    const d = doc.data()!;

    const resultsSnap = await getCollection().doc(runId).collection("results").get();
    const results: EngineRunResult[] = resultsSnap.docs.map(r => r.data() as EngineRunResult);

    return {
      runId: d.runId,
      complaintId: d.complaintId,
      totalCases: d.totalCases,
      results,
      stats: d.stats,
      timestamp: d.timestamp,
    };
  } catch {
    return undefined;
  }
}

export async function getRunStats(runId: string): Promise<RunStats | undefined> {
  try {
    const doc = await getCollection().doc(runId).get();
    if (!doc.exists) return undefined;
    return doc.data()!.stats as RunStats;
  } catch {
    return undefined;
  }
}

export async function getLatestRunForComplaint(complaintId: string): Promise<Omit<TestRun, "results"> | undefined> {
  try {
    const snap = await getCollection()
      .where("complaintId", "==", complaintId)
      .orderBy("timestamp", "desc")
      .limit(1)
      .get();
    if (snap.empty) return undefined;
    const d = snap.docs[0].data();
    return {
      runId: d.runId,
      complaintId: d.complaintId,
      totalCases: d.totalCases,
      stats: d.stats,
      timestamp: d.timestamp,
    } as Omit<TestRun, "results">;
  } catch {
    return undefined;
  }
}
