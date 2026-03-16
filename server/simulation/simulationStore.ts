import { SimulationCase } from "./simulationCaseFactory";
import { SimulationEvaluation } from "./simulationEvaluator";

export interface SimulationRunRecord {
  runId: string;
  createdAt: number;
  complaint: string;
  difficulty: string;
  cases: SimulationCase[];
  results: SimulationEvaluation[];
  summary: {
    totalCases: number;
    dispositionAccuracy: number;
    diagnosisAccuracy: number;
    avgScore: number;
    redFlagMissRate: number;
  };
  failureBreakdown?: Record<string, number>;
  learningUpdates?: any[];
}

const simulationRuns: SimulationRunRecord[] = [];

export function saveSimulationRun(run: SimulationRunRecord) {
  simulationRuns.unshift(run);
  if (simulationRuns.length > 100) simulationRuns.pop();
}

export function listSimulationRuns() {
  return simulationRuns.map(r => ({
    runId: r.runId,
    createdAt: r.createdAt,
    complaint: r.complaint,
    difficulty: r.difficulty,
    summary: r.summary,
    failureBreakdown: r.failureBreakdown,
  }));
}

export function getSimulationRun(runId: string) {
  return simulationRuns.find(r => r.runId === runId) ?? null;
}

export function clearSimulationRuns() {
  simulationRuns.length = 0;
}

export function getLastRunSummary() {
  return simulationRuns[0]?.summary ?? null;
}
