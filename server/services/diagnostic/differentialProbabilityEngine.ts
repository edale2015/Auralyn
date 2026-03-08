export interface DifferentialCandidate {
  clusterId: string;
  priorProbability: number;
  posteriorProbability: number;
  evidenceFor: string[];
  evidenceAgainst: string[];
}

export function computeDifferentialProbabilities(
  dxCandidates: Array<{ clusterId: string; score: number }>,
  answers: Record<string, unknown>
): DifferentialCandidate[] {
  const totalScore = dxCandidates.reduce((s, d) => s + Math.max(0, d.score), 0) || 1;

  return dxCandidates.map((d) => {
    const prior = Math.max(0, d.score) / totalScore;
    const answeredKeys = Object.keys(answers).filter((k) => answers[k] !== undefined && answers[k] !== null);
    return {
      clusterId: d.clusterId,
      priorProbability: prior,
      posteriorProbability: prior,
      evidenceFor: answeredKeys.slice(0, 3),
      evidenceAgainst: [],
    };
  }).sort((a, b) => b.posteriorProbability - a.posteriorProbability);
}
