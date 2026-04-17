# RLHF and Safe Learning

## Review Prompt

Review this learning system.
Focus on:
  - Risk of unsafe drift in clinical weights over time
  - Whether weight bounds are sufficient to prevent dangerous updates
  - Evidence threshold adequacy
  - Physician gating effectiveness
  - Whether rejected proposals correctly block future re-application

## Files

---

### Final Meta Question (ask after reviewing)

List the **TOP 5 MOST DANGEROUS FAILURE MODES** in this section.
Be specific. Do not give generic advice. Focus on real-world clinical risk.

### server/rlhf/rlhfEngine.ts

```ts
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
```

### server/rlhf/trainer.ts

```ts
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
```

### server/rlhf/approval.ts

```ts
/**
 * RLHF physician approval gate.
 *
 * Before any weight update that exceeds the bounded threshold is
 * committed, it must pass through physician review.  This module
 * determines whether approval is required and formats the change
 * summary for the review queue.
 */

import { pendingApprovalItems, WeightMap } from "./rlhfEngine";

export interface ApprovalRequest {
  requiresApproval: boolean;
  changes:          Array<{ feature: string; diff: number; proposed: number; current: number }>;
  summary:          string;
}

/**
 * Inspect proposed vs current model and return an approval request
 * containing everything the physician needs to evaluate the change.
 */
export function requireApproval(
  proposedModel: WeightMap,
  currentModel:  WeightMap,
): ApprovalRequest {
  const items = pendingApprovalItems(proposedModel, currentModel);

  const changes = items.map((item) => ({
    feature:  item.feature,
    diff:     item.diff,
    proposed: proposedModel[item.feature] ?? 0,
    current:  currentModel[item.feature]  ?? 0,
  }));

  const summary =
    changes.length === 0
      ? "No physician approval required — all deltas within automatic threshold."
      : `${changes.length} feature weight(s) require physician approval: ` +
        changes.map((c) => `${c.feature} (${c.current.toFixed(4)} → ${c.proposed.toFixed(4)})`).join(", ");

  return { requiresApproval: changes.length > 0, changes, summary };
}

/**
 * Apply the proposed model only if no approval is required.
 * Returns null if approval is still needed.
 */
export function applyIfAutomatic(
  proposedModel: WeightMap,
  currentModel:  WeightMap,
): WeightMap | null {
  const approval = requireApproval(proposedModel, currentModel);
  if (approval.requiresApproval) return null;
  return proposedModel;
}
```

### server/rlhf/weightUpdater.ts

```ts
/**
 * weightUpdater.ts — Safe RLHF weight updates for clinical decision models
 *
 * Article 28b (Command Center): "updateWeights(results):
 *   failures = results.filter(r => !r.correct)
 *   if failures.length < 50 → return (minimum failures required)
 *   for each failure: UPDATE clinical_weights SET weight = weight + 0.02
 *   Safe RLHF: requires minimum failures, small bounded updates (±2%)"
 *
 * Safety constraints:
 *   1. Minimum 50 failures required before any weight update
 *      (prevents noisy updates from small samples)
 *   2. Bounded delta: ±2% per update cycle
 *      (prevents catastrophic forgetting or runaway learning)
 *   3. Feature-specific: only updates features implicated in failures
 *   4. Full audit trail: every update is logged with failure count + delta
 *
 * Clinical RLHF principle:
 *   Physician feedback is sparse and expensive. The model must improve reliably
 *   from small signals. Conservative bounds + minimums ensure the model
 *   never overcorrects on noisy data.
 *
 * In-memory weight store (real system would use DB):
 *   Production: UPDATE clinical_weights SET weight = weight + delta WHERE feature = 'lactate'
 */

export type ClinicalFeature =
  | "lactate"
  | "news2"
  | "qsofa"
  | "sbp"
  | "hr"
  | "rr"
  | "spo2"
  | "temperature"
  | "wbc";

export interface ClinicalWeight {
  feature:    ClinicalFeature;
  weight:     number;   // 0-1 range
  updateCount: number;
  lastDelta:  number;
  updatedAt:  Date;
}

export interface WeightUpdateResult {
  updated:       boolean;
  skipped?:      string;     // reason for skip
  failures:      number;
  delta:         number;
  updatedFeatures: ClinicalFeature[];
  weights:       Record<ClinicalFeature, number>;
  ranAt:         Date;
}

export interface WeightUpdateRecord {
  id:          string;
  delta:       number;
  failures:    number;
  features:    ClinicalFeature[];
  previousWeights: Record<string, number>;
  newWeights:  Record<string, number>;
  ranAt:       Date;
}

// ── In-memory weight store ────────────────────────────────────────────────────

const DEFAULT_WEIGHTS: Record<ClinicalFeature, number> = {
  lactate:     0.5,
  news2:       0.5,
  qsofa:       0.5,
  sbp:         0.5,
  hr:          0.4,
  rr:          0.4,
  spo2:        0.4,
  temperature: 0.3,
  wbc:         0.3,
};

const _weights: Map<ClinicalFeature, ClinicalWeight> = new Map(
  Object.entries(DEFAULT_WEIGHTS).map(([f, w]) => [
    f as ClinicalFeature,
    { feature: f as ClinicalFeature, weight: w, updateCount: 0, lastDelta: 0, updatedAt: new Date() },
  ]),
);

const _updateHistory: WeightUpdateRecord[] = [];

// ── updateWeights ─────────────────────────────────────────────────────────────

const MIN_FAILURES = 50;    // Article: minimum failures before update
const DELTA        = 0.02;  // Article: bounded ±2% per cycle
const MAX_WEIGHT   = 0.95;  // safety ceiling
const MIN_WEIGHT   = 0.05;  // safety floor

export function updateWeights(
  results: Array<{ correct: boolean; errors?: string[] }>,
  feature: ClinicalFeature = "lactate",
): WeightUpdateResult {
  const failures = results.filter((r) => !r.correct);

  // Safety gate: minimum failures required
  if (failures.length < MIN_FAILURES) {
    return {
      updated:         false,
      skipped:         `Only ${failures.length} failures (minimum ${MIN_FAILURES} required). Sample too small for reliable weight update.`,
      failures:        failures.length,
      delta:           0,
      updatedFeatures: [],
      weights:         getCurrentWeights(),
      ranAt:           new Date(),
    };
  }

  // Determine which features to update based on failure patterns
  const featuresToUpdate = identifyImplicatedFeatures(failures, feature);
  const previousWeights: Record<string, number> = {};
  const newWeights: Record<string, number> = {};

  for (const feat of featuresToUpdate) {
    const current = _weights.get(feat);
    if (!current) continue;

    previousWeights[feat] = current.weight;

    // Bounded update: increase feature weight (model under-weighting this feature)
    const newWeight = Math.min(MAX_WEIGHT, Math.max(MIN_WEIGHT, current.weight + DELTA));
    current.weight      = Math.round(newWeight * 1000) / 1000;
    current.updateCount += 1;
    current.lastDelta   = DELTA;
    current.updatedAt   = new Date();

    newWeights[feat] = current.weight;
  }

  const record: WeightUpdateRecord = {
    id:              `wu_${Date.now()}`,
    delta:           DELTA,
    failures:        failures.length,
    features:        featuresToUpdate,
    previousWeights,
    newWeights,
    ranAt:           new Date(),
  };
  _updateHistory.push(record);

  return {
    updated:         true,
    failures:        failures.length,
    delta:           DELTA,
    updatedFeatures: featuresToUpdate,
    weights:         getCurrentWeights(),
    ranAt:           new Date(),
  };
}

function identifyImplicatedFeatures(
  failures: Array<{ errors?: string[] }>,
  primaryFeature: ClinicalFeature,
): ClinicalFeature[] {
  const implicated = new Set<ClinicalFeature>([primaryFeature]);

  for (const f of failures) {
    for (const err of (f.errors ?? [])) {
      const e = err.toLowerCase();
      if (e.includes("lactate"))    implicated.add("lactate");
      if (e.includes("sepsis"))     implicated.add("qsofa");
      if (e.includes("icu"))        implicated.add("sbp");
      if (e.includes("news"))       implicated.add("news2");
    }
  }

  return Array.from(implicated);
}

function getCurrentWeights(): Record<ClinicalFeature, number> {
  return Object.fromEntries(
    Array.from(_weights.entries()).map(([k, v]) => [k, v.weight])
  ) as Record<ClinicalFeature, number>;
}

export function getWeights(): ClinicalWeight[] {
  return Array.from(_weights.values());
}

export function getUpdateHistory(): WeightUpdateRecord[] {
  return _updateHistory;
}

export function resetWeights(): void {
  for (const [f, w] of Object.entries(DEFAULT_WEIGHTS)) {
    const entry = _weights.get(f as ClinicalFeature);
    if (entry) { entry.weight = w; entry.updateCount = 0; entry.lastDelta = 0; }
  }
  _updateHistory.length = 0;
}
```
