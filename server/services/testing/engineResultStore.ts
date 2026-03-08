import type { EngineRunResult } from "./engineMassRunner";

export interface TestRun {
  runId: string;
  complaintId: string;
  totalCases: number;
  results: EngineRunResult[];
  timestamp: string;
}

const testRuns: TestRun[] = [];

export function storeTestRun(complaintId: string, results: EngineRunResult[]): TestRun {
  const run: TestRun = {
    runId: `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    complaintId,
    totalCases: results.length,
    results,
    timestamp: new Date().toISOString(),
  };
  testRuns.push(run);
  return run;
}

export function listTestRuns(): TestRun[] { return [...testRuns].reverse(); }
export function getTestRun(runId: string): TestRun | undefined { return testRuns.find((r) => r.runId === runId); }
