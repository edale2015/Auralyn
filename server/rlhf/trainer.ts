/**
 * RLHF Trainer — applies outcome feedback to update feature weights
 * using the bounded update engine.
 */

import { applyBoundedUpdates, computeDeltas, RlhfTrainingOutcome, WeightMap } from "./rlhfEngine";

export interface TrainingResult {
  newModel:   WeightMap;
  deltas:     WeightMap;
  changedKeys: string[];
}

/**
 * Train from a batch of physician outcome signals.
 *
 * @param model    current feature weight map
 * @param outcomes list of {feature, correct} signals
 * @returns        updated model + change summary
 */
export function trainFromOutcomes(
  model:    WeightMap,
  outcomes: RlhfTrainingOutcome[],
): TrainingResult {
  const deltas   = computeDeltas(outcomes);
  const newModel = applyBoundedUpdates(model, deltas);

  const changedKeys = Object.keys(deltas).filter(
    (k) => Math.abs((newModel[k] ?? 0) - (model[k] ?? 0)) > 1e-9,
  );

  return { newModel, deltas, changedKeys };
}
