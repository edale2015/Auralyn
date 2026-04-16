/**
 * Fisher-informed Bayesian belief updater for differential diagnosis.
 *
 * Combines:
 *  • Standard log-likelihood Bayesian update
 *  • Natural gradient step (geometry-aware) via Fisher diagonal
 *
 * The result is a posterior that respects the probability simplex
 * and has been pre-conditioned by feature importance.
 */

import { computeDiagonalFisher, ProbDist } from "./fisher";
import { naturalGradientStep }             from "./naturalGradient";

export type Observation = {
  feature: string;
  /** Numeric signal strength — boolean mapped to 0/1 by caller */
  value: number;
};

export interface BayesianUpdateResult {
  posterior:  ProbDist;
  fisher:     ProbDist;
  gradients:  ProbDist;
}

/**
 * Update clinical prior beliefs given observations and per-diagnosis likelihoods.
 *
 * @param prior        P(D) — unconditional probability per diagnosis
 * @param likelihoods  P(symptom | D) — flat map keyed by diagnosis id
 * @param observations list of observed {feature, value} pairs
 */
export function updateBeliefsWithFisher(
  prior: ProbDist,
  likelihoods: ProbDist,
  observations: Observation[],
): BayesianUpdateResult {
  const gradients: ProbDist = {};

  // Gradient of log-likelihood w.r.t. each diagnosis parameter
  for (const dx in prior) {
    let grad = 0;
    for (const obs of observations) {
      const likelihood = Math.max(likelihoods[dx] ?? 1e-6, 1e-8);
      grad += Math.log(likelihood) * obs.value;
    }
    gradients[dx] = grad;
  }

  const fisher    = computeDiagonalFisher(prior, gradients);
  const posterior = naturalGradientStep(prior, gradients, fisher, 0.05);

  return { posterior, fisher, gradients };
}
