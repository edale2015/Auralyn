import { runMassSimulation } from "./massSimulationEngine";

export interface SimulationTrainingResult {
  totalCases: number;
  outcomes: Array<{
    complaint: string;
    predicted: string;
    actual: string;
    match: boolean;
  }>;
  accuracy: number;
}

export async function simulateAndTrain(
  packs: any[],
  count: number = 500
): Promise<SimulationTrainingResult> {
  const simResult = runMassSimulation(packs, count);

  const outcomes = (simResult.cases || []).map((c: any) => ({
    complaint: c.complaint || "unknown",
    predicted: c.predictedDiagnosis || c.diagnosis || "unknown",
    actual: c.actualDiagnosis || c.diagnosis || "unknown",
    match: (c.predictedDiagnosis || c.diagnosis) === (c.actualDiagnosis || c.diagnosis),
  }));

  const correct = outcomes.filter((o: any) => o.match).length;
  const accuracy = outcomes.length > 0 ? correct / outcomes.length : 0;

  return {
    totalCases: outcomes.length,
    outcomes,
    accuracy,
  };
}
