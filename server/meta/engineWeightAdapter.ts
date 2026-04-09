/**
 * Engine Weight Adapter (Controlled)
 *
 * Adjusts the relative weights of the three reasoning engines (Bayesian,
 * similarity, rules) based on observed performance metrics.
 *
 * IMPORTANT: These adjustments are PROPOSALS, not immediate changes.
 * Every weight proposal must go through validateChangeWithGoldenCases()
 * before being applied. This module only computes what should change —
 * the change approval gate decides whether it's safe to apply.
 *
 * Weight shift logic:
 *   - If similarity engine success rate > Bayesian success rate, shift 10%
 *     weight from Bayesian → similarity
 *   - If rules engine outperforms both, shift weight toward rules
 *   - Weights always sum to 1.0 (renormalized after adjustment)
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface EngineMetrics {
  bayesianSuccess?:    number;   // 0–1 accuracy rate for Bayesian engine
  similaritySuccess?:  number;   // 0–1 accuracy rate for similarity engine
  rulesSuccess?:       number;   // 0–1 accuracy rate for rules engine
  sampleSize?:         number;   // outcomes used to compute these metrics
}

export interface EngineWeights {
  bayesian:   number;   // 0–1
  similarity: number;   // 0–1
  rules:      number;   // 0–1
}

export interface WeightProposal {
  currentWeights:  EngineWeights;
  proposedWeights: EngineWeights;
  adjustments:     string[];      // human-readable explanation of each shift
  requiresReview:  true;         // ALWAYS true — this is a proposal, never auto-applied
  confidence:      number;       // 0–1 based on sample size
}

// ── Default weights ───────────────────────────────────────────────────────────

const DEFAULT_WEIGHTS: EngineWeights = {
  bayesian:   0.5,
  similarity: 0.3,
  rules:      0.2,
};

const SHIFT_MAGNITUDE   = 0.1;   // maximum single-cycle shift
const MIN_WEIGHT        = 0.05;  // no engine drops below 5%
const MIN_SAMPLE_SIZE   = 20;    // require ≥ 20 outcomes for a weight shift proposal

// ── Engine ────────────────────────────────────────────────────────────────────

/**
 * Compute a weight adjustment proposal based on observed engine performance.
 *
 * Returns the proposal — caller must validate via golden cases before applying.
 */
export function proposeEngineWeightAdjustment(
  metrics:        EngineMetrics,
  currentWeights: EngineWeights = DEFAULT_WEIGHTS
): WeightProposal {
  const adjustments: string[] = [];
  const sample = metrics.sampleSize ?? 0;

  // Not enough data — return current weights unchanged
  if (sample < MIN_SAMPLE_SIZE) {
    return {
      currentWeights,
      proposedWeights: { ...currentWeights },
      adjustments:     [`Insufficient sample size (${sample} < ${MIN_SAMPLE_SIZE}) — no weight change proposed`],
      requiresReview:  true,
      confidence:      0,
    };
  }

  const bayesian   = metrics.bayesianSuccess   ?? 0.5;
  const similarity = metrics.similaritySuccess ?? 0.5;
  const rules      = metrics.rulesSuccess      ?? 0.5;

  let weights = { ...currentWeights };

  // Shift weight from lowest performer to highest performer
  const performers = [
    { engine: "bayesian"   as keyof EngineWeights, rate: bayesian },
    { engine: "similarity" as keyof EngineWeights, rate: similarity },
    { engine: "rules"      as keyof EngineWeights, rate: rules },
  ].sort((a, b) => b.rate - a.rate);

  const best  = performers[0];
  const worst = performers[2];

  if (best.rate - worst.rate > 0.05) {
    const shift = Math.min(SHIFT_MAGNITUDE, weights[worst.engine] - MIN_WEIGHT);
    if (shift > 0) {
      weights[worst.engine] -= shift;
      weights[best.engine]  += shift;
      adjustments.push(
        `Shifted ${(shift * 100).toFixed(0)}% from ${worst.engine} (${(worst.rate * 100).toFixed(1)}% success) ` +
        `to ${best.engine} (${(best.rate * 100).toFixed(1)}% success)`
      );
    }
  }

  // Renormalize to sum = 1.0
  const total = weights.bayesian + weights.similarity + weights.rules;
  const proposed: EngineWeights = {
    bayesian:   Number((weights.bayesian   / total).toFixed(3)),
    similarity: Number((weights.similarity / total).toFixed(3)),
    rules:      Number((weights.rules      / total).toFixed(3)),
  };

  if (!adjustments.length) {
    adjustments.push("All engines within 5% of each other — no weight change needed");
  }

  const confidence = Math.min(1, sample / 200);  // full confidence at 200+ outcomes

  return {
    currentWeights,
    proposedWeights: proposed,
    adjustments,
    requiresReview:  true,
    confidence,
  };
}
