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
