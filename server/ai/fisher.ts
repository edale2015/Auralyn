/**
 * Diagonal Fisher Information Matrix approximation.
 *
 * F_i = E[(∂ log p / ∂θ_i)²]
 *
 * Used to scale gradients so updates are geometry-aware
 * (natural gradient) rather than Euclidean.
 */

export type ProbDist = Record<string, number>;

/**
 * Compute diagonal Fisher for each key in probs.
 * Grad is divided by probability mass → high-probability entries
 * with large gradients receive proportionally smaller natural steps.
 */
export function computeDiagonalFisher(
  probs: ProbDist,
  gradients: ProbDist,
): ProbDist {
  const fisher: ProbDist = {};

  for (const key in probs) {
    const p    = Math.max(probs[key] ?? 0, 1e-8);   // avoid /0
    const grad = gradients[key] ?? 0;

    fisher[key] = (grad * grad) / p;
  }

  return fisher;
}

/**
 * Feature importance from Fisher: higher value → symptom more
 * discriminative for that diagnosis.  Used by the adaptive
 * question engine to pick the next most-informative question.
 */
export function rankFeaturesByFisher(fisher: ProbDist): Array<{ key: string; importance: number }> {
  return Object.entries(fisher)
    .map(([key, importance]) => ({ key, importance }))
    .sort((a, b) => b.importance - a.importance);
}
