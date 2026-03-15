import type { EngineScore } from './bayesianEngine';

export function evidenceAggregator(
  bayes: EngineScore[],
  similarity: EngineScore[],
  bayesWeight = 0.7,
  similarityWeight = 0.3
): EngineScore[] {
  const scores: Record<string, number> = {};
  const add = (list: EngineScore[], w: number) => {
    for (const d of list) {
      scores[d.diagnosis] = (scores[d.diagnosis] ?? 0) + d.score * w;
    }
  };
  add(bayes, bayesWeight);
  add(similarity, similarityWeight);
  return Object.entries(scores)
    .map(([diagnosis, score]) => ({ diagnosis, score }))
    .sort((a, b) => b.score - a.score);
}
