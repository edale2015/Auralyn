import type { DifferentialCandidate } from "./differentialProbabilityEngine";

export interface QuestionImpact {
  token: string;
  informationGain: number;
  separationPower: number;
  affectedClusters: string[];
}

export function analyzeQuestionImpact(
  candidates: DifferentialCandidate[],
  availableQuestions: string[],
  answeredQuestions: Set<string>
): QuestionImpact[] {
  const unanswered = availableQuestions.filter((q) => !answeredQuestions.has(q));

  return unanswered.map((token) => {
    const topTwo = candidates.slice(0, 2);
    const separation = topTwo.length >= 2
      ? Math.abs(topTwo[0].posteriorProbability - topTwo[1].posteriorProbability)
      : 0;

    const informationGain = Math.max(0, 1 - separation) * (1 / (unanswered.length || 1));

    return {
      token,
      informationGain: Math.round(informationGain * 1000) / 1000,
      separationPower: Math.round((1 - separation) * 100) / 100,
      affectedClusters: topTwo.map((c) => c.clusterId),
    };
  }).sort((a, b) => b.informationGain - a.informationGain);
}
