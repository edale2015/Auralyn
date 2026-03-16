import { SimulationCase } from "./simulationCaseFactory";

export interface SimulationPrediction {
  predictedDisposition: "er_now" | "urgent_care" | "self_care";
  predictedTopDiagnosis?: string;
  confidence?: number;
  trace?: any[];
}

export interface SimulationEvaluation {
  caseId: string;
  complaint: string;
  expectedDisposition: string;
  predictedDisposition: string;
  dispositionCorrect: boolean;
  expectedTopDiagnosis?: string;
  predictedTopDiagnosis?: string;
  diagnosisMatch: boolean;
  confidence: number;
  score: number;
  redFlagMiss: boolean;
}

export function evaluateSimulationCase(
  simCase: SimulationCase,
  prediction: SimulationPrediction
): SimulationEvaluation {
  const dispositionCorrect = simCase.expectedDisposition === prediction.predictedDisposition;

  const diagnosisMatch =
    !!simCase.expectedTopDiagnosis &&
    !!prediction.predictedTopDiagnosis &&
    simCase.expectedTopDiagnosis === prediction.predictedTopDiagnosis;

  const confidence = prediction.confidence ?? 0.5;

  const redFlagMiss =
    simCase.expectedDisposition === "er_now" &&
    prediction.predictedDisposition !== "er_now";

  let score = 0;
  if (dispositionCorrect) score += 70;
  if (diagnosisMatch) score += 20;
  score += Math.round(Math.min(10, confidence * 10));
  if (redFlagMiss) score -= 40;
  if (score < 0) score = 0;

  return {
    caseId: simCase.caseId,
    complaint: simCase.complaint,
    expectedDisposition: simCase.expectedDisposition,
    predictedDisposition: prediction.predictedDisposition,
    dispositionCorrect,
    expectedTopDiagnosis: simCase.expectedTopDiagnosis,
    predictedTopDiagnosis: prediction.predictedTopDiagnosis,
    diagnosisMatch,
    confidence,
    score,
    redFlagMiss,
  };
}

export function summarizeEvaluations(results: SimulationEvaluation[]) {
  const total = results.length || 1;
  const dispositionAccuracy = results.filter(r => r.dispositionCorrect).length / total;
  const diagnosisAccuracy = results.filter(r => r.diagnosisMatch).length / total;
  const avgScore = results.reduce((sum, r) => sum + r.score, 0) / total;
  const redFlagMissRate = results.filter(r => r.redFlagMiss).length / total;

  return {
    totalCases: results.length,
    dispositionAccuracy,
    diagnosisAccuracy,
    avgScore,
    redFlagMissRate,
  };
}
