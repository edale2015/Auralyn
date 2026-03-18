import { getRecentOutcomes } from "./outcomeLearningEngine";
import { reinforceOutcome } from "./rlhfEngine";
import { getAllWeights } from "./weightStore";

export interface LearningLoopResult {
  processed: number;
  adjustments: number;
  weights: Record<string, number>;
  timestamp: string;
}

export function runLearningLoop(): LearningLoopResult {
  const outcomes = getRecentOutcomes(100);
  let adjustmentCount = 0;

  for (const entry of outcomes) {
    const result = reinforceOutcome(
      { diagnosis: entry.predictedDiagnosis, triage: "routine", packId: entry.packId },
      { diagnosis: entry.actualDiagnosis, triage: "routine", correct: entry.correct }
    );
    adjustmentCount += result.adjustments.length;
  }

  return {
    processed: outcomes.length,
    adjustments: adjustmentCount,
    weights: getAllWeights(),
    timestamp: new Date().toISOString(),
  };
}
