/**
 * RLHF bounded update engine.
 *
 * All weight deltas are clipped to ±MAX_DELTA so a single bad batch
 * of feedback cannot catastrophically shift clinical routing weights.
 *
 * Any proposed change > APPROVAL_THRESHOLD triggers the physician
 * approval gate before the weight is committed.
 */

const MAX_DELTA        = 0.02;  // 2% maximum change per training step
const APPROVAL_THRESHOLD = 0.01; // changes > 1% require physician sign-off

/**
 * Clip a delta to ±MAX_DELTA.
 */
export function boundedUpdate(oldWeight: number, delta: number): number {
  const clipped = Math.max(-MAX_DELTA, Math.min(MAX_DELTA, delta));
  return oldWeight + clipped;
}

export type WeightMap = Record<string, number>;

export interface RlhfTrainingOutcome {
  feature:  string;
  correct:  boolean;
  weight?:  number;
}

/**
 * Compute raw deltas from a batch of outcome signals.
 * +0.01 for correct predictions, -0.01 for incorrect.
 */
export function computeDeltas(outcomes: RlhfTrainingOutcome[]): WeightMap {
  const deltas: WeightMap = {};

  for (const o of outcomes) {
    deltas[o.feature] = (deltas[o.feature] ?? 0) + (o.correct ? 0.01 : -0.01);
  }

  return deltas;
}

/**
 * Apply bounded updates to a model weight map.
 * Returns the new model — does NOT mutate the input.
 */
export function applyBoundedUpdates(model: WeightMap, deltas: WeightMap): WeightMap {
  const newModel: WeightMap = { ...model };

  for (const f in deltas) {
    newModel[f] = boundedUpdate(model[f] ?? 0, deltas[f]);
  }

  return newModel;
}

/**
 * List features whose weight changed by more than APPROVAL_THRESHOLD.
 * An empty list means no physician sign-off is required.
 */
export function pendingApprovalItems(
  proposed: WeightMap,
  current:  WeightMap,
): Array<{ feature: string; diff: number }> {
  return Object.keys(proposed)
    .map((k) => ({ feature: k, diff: Math.abs((proposed[k] ?? 0) - (current[k] ?? 0)) }))
    .filter((item) => item.diff > APPROVAL_THRESHOLD);
}
