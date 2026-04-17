# Diagnosis Engine — Bayesian + Fisher + Natural Gradient

## Review Prompt

Review this diagnosis engine.

Focus on: mathematical correctness of posterior updates,
stability under missing or contradictory inputs,
Fisher information scaling, natural gradient step safety,
and failure modes that could bias toward low-risk diagnoses.

## Files

---

### Final Meta Question (ask after reviewing)

List the **TOP 5 MOST DANGEROUS FAILURE MODES** in this section.
Be specific. Do not give generic advice. Focus on real-world clinical risk.

```ts
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
```

### server/ai/bayesianUpdater.ts

```ts
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
```

### server/ai/naturalGradient.ts

```ts
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
```

