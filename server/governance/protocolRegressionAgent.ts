import { runGraphDrivenSimulation, GraphSimulationResult } from "../simulation/graphDrivenSimulationEngine";

export interface RegressionTestResult {
  passed: boolean;
  total: number;
  failures: number;
  failureDetails: { gap: string; status: string; recommendation: string }[];
  runAt: string;
  duration: number;
}

export function runProtocolRegressionTest(maxSimulations = 50): RegressionTestResult {
  const start = Date.now();

  const simulation = runGraphDrivenSimulation(maxSimulations);

  const failures = simulation.results.filter(
    (s) => s.status === "failure" || s.status === "critical_gap"
  );

  return {
    passed: failures.length === 0,
    total: simulation.simulatedCount,
    failures: failures.length,
    failureDetails: failures.map((f) => ({
      gap: f.gap.nodeLabel,
      status: f.status,
      recommendation: f.recommendation,
    })),
    runAt: new Date().toISOString(),
    duration: Date.now() - start,
  };
}
