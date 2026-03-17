import { outcomeLearningEngine } from "../../engines/outcomeLearningEngine";

export interface LearningResult {
  diagnosticAccuracy: number;
  dispositionAccuracy: number;
  updatedProbabilities: Record<string, number>;
  timestamp: number;
}

export class LearningLayer {
  learn(): LearningResult {
    const report = outcomeLearningEngine.learn();
    return {
      diagnosticAccuracy: report.diagnosticAccuracy,
      dispositionAccuracy: report.dispositionAccuracy,
      updatedProbabilities: report.updatedProbabilities,
      timestamp: Date.now(),
    };
  }
}

export const learningLayer = new LearningLayer();
