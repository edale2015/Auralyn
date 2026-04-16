/**
 * Natural gradient step for probability distributions.
 *
 * θ_new = θ + η · F⁻¹ · ∇L
 *
 * By pre-conditioning on the Fisher information matrix we
 * take steps that are invariant to reparameterisation —
 * critical for probability simplex updates.
 */

import { ProbDist } from "./fisher";

/**
 * Apply a single natural gradient step then re-normalise to sum=1.
 *
 * @param params       current parameter values
 * @param gradients    gradient of the loss w.r.t. each param
 * @param fisherDiag   diagonal Fisher approximation (from computeDiagonalFisher)
 * @param learningRate step size (default 0.1 — caller should tune)
 */
export function naturalGradientStep(
  params: ProbDist,
  gradients: ProbDist,
  fisherDiag: ProbDist,
  learningRate = 0.1,
): ProbDist {
  const updated: ProbDist = {};

  for (const key in params) {
    const grad   = gradients[key]  ?? 0;
    const fisher = Math.max(fisherDiag[key] ?? 0, 1e-6);   // avoid /0

    const natGrad = grad / fisher;
    updated[key]  = (params[key] ?? 0) + learningRate * natGrad;
  }

  return normaliseSimplex(updated);
}

/**
 * Project onto the probability simplex (all values ≥ 0, sum = 1).
 */
function normaliseSimplex(dist: ProbDist): ProbDist {
  // Shift negative values to 0 first
  const clipped: ProbDist = {};
  for (const k in dist) clipped[k] = Math.max(dist[k] ?? 0, 0);

  const sum = Object.values(clipped).reduce((a, b) => a + b, 0);
  if (sum === 0) {
    const keys = Object.keys(clipped);
    const uniform = 1 / (keys.length || 1);
    for (const k of keys) clipped[k] = uniform;
    return clipped;
  }

  const out: ProbDist = {};
  for (const k in clipped) out[k] = clipped[k] / sum;
  return out;
}
