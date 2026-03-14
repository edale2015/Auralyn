export type DxScore = {
  diagnosis: string;
  score: number;
};

export type AggregatedDifferential = {
  diagnosis: string;
  score: number;
  bayesianScore: number;
  similarityScore: number;
  graphScore: number;
};

/**
 * Merges three independent diagnostic ranking signals with weighted combination:
 *   Bayesian differential   — 50 % (strongest statistical signal)
 *   Case similarity         — 30 % (real-case grounding)
 *   Knowledge graph evidence — 20 % (background clinical knowledge)
 *
 * All scores are normalised to [0,1] before weighting so no single engine
 * can dominate purely because of scale.
 */
export function evidenceAggregatorEngine(
  bayesian: DxScore[],
  similarity: DxScore[],
  graph: DxScore[],
  weights: { bayesian: number; similarity: number; graph: number } = { bayesian: 0.5, similarity: 0.3, graph: 0.2 }
): AggregatedDifferential[] {
  const scores: Record<string, { bayesian: number; similarity: number; graph: number }> = {};

  function normalise(list: DxScore[]): DxScore[] {
    const max = Math.max(...list.map((d) => d.score), 1e-9);
    return list.map((d) => ({ ...d, score: d.score / max }));
  }

  function add(list: DxScore[], field: "bayesian" | "similarity" | "graph") {
    for (const dx of normalise(list)) {
      if (!scores[dx.diagnosis]) scores[dx.diagnosis] = { bayesian: 0, similarity: 0, graph: 0 };
      scores[dx.diagnosis][field] = dx.score;
    }
  }

  add(bayesian,   "bayesian");
  add(similarity, "similarity");
  add(graph,      "graph");

  return Object.entries(scores)
    .map(([diagnosis, s]) => ({
      diagnosis,
      bayesianScore:  s.bayesian,
      similarityScore: s.similarity,
      graphScore:     s.graph,
      score:
        s.bayesian   * weights.bayesian   +
        s.similarity * weights.similarity +
        s.graph      * weights.graph,
    }))
    .sort((a, b) => b.score - a.score);
}
