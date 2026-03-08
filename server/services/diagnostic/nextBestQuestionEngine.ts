import { computeDifferentialProbabilities } from "./differentialProbabilityEngine";
import { analyzeQuestionImpact, type QuestionImpact } from "./questionImpactAnalyzer";

export interface NextBestQuestionResult {
  bestQuestion: string | null;
  rankings: QuestionImpact[];
  differentials: { clusterId: string; probability: number }[];
}

export function selectNextBestQuestion(
  dxCandidates: Array<{ clusterId: string; score: number }>,
  answers: Record<string, unknown>,
  availableQuestions: string[]
): NextBestQuestionResult {
  const differentials = computeDifferentialProbabilities(dxCandidates, answers);
  const answeredSet = new Set(Object.keys(answers).filter((k) => answers[k] !== undefined && answers[k] !== null));
  const rankings = analyzeQuestionImpact(differentials, availableQuestions, answeredSet);

  return {
    bestQuestion: rankings.length > 0 ? rankings[0].token : null,
    rankings: rankings.slice(0, 10),
    differentials: differentials.map((d) => ({
      clusterId: d.clusterId,
      probability: d.posteriorProbability,
    })),
  };
}
