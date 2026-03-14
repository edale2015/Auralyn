export interface UncertaintyResult {
  entropy: number;
  normalizedEntropy: number;
  isHighUncertainty: boolean;
  recommendation: "ask_more" | "confident" | "needs_workup";
  dominantDiagnosis?: string;
  dominantProbability?: number;
}

/**
 * Shannon entropy over a probability distribution.
 * Returns 0 for a certain distribution, ln(N) for perfectly uniform.
 */
export function entropy(probabilities: number[]): number {
  const total = probabilities.reduce((a, b) => a + b, 0);
  if (total === 0) return 0;

  let e = 0;
  for (const p of probabilities) {
    const pNorm = p / total;
    if (pNorm > 0) e -= pNorm * Math.log(pNorm);
  }
  return e;
}

export function computeUncertainty(
  differentials: Array<{ clusterId?: string; diagnosis?: string; posteriorProbability?: number; score?: number }>,
  HIGH_THRESHOLD = 1.2
): UncertaintyResult {
  if (differentials.length === 0) {
    return {
      entropy: 0,
      normalizedEntropy: 0,
      isHighUncertainty: true,
      recommendation: "ask_more",
    };
  }

  const probs = differentials.map(
    (d) => d.posteriorProbability ?? d.score ?? 0
  );

  const e = entropy(probs);
  const maxEntropy = Math.log(Math.max(differentials.length, 1));
  const normalized = maxEntropy > 0 ? e / maxEntropy : 0;

  const top = differentials[0];
  const topProb = top.posteriorProbability ?? top.score ?? 0;
  const topId = top.clusterId ?? top.diagnosis ?? undefined;

  let recommendation: UncertaintyResult["recommendation"];
  if (topProb > 0.6 && normalized < 0.4) {
    recommendation = "confident";
  } else if (e > HIGH_THRESHOLD || probs.length < 2) {
    recommendation = "ask_more";
  } else {
    recommendation = "needs_workup";
  }

  return {
    entropy: e,
    normalizedEntropy: normalized,
    isHighUncertainty: e > HIGH_THRESHOLD,
    recommendation,
    dominantDiagnosis: topId,
    dominantProbability: topProb,
  };
}
