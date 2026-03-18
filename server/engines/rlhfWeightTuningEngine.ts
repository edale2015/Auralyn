export type OutcomeRecord = {
  complaintId: string;
  clusterId?: string;
  dispositionPredicted?: string;
  dispositionActual?: string;
  diagnosisPredicted?: string;
  diagnosisActual?: string;
  features: string[];
  timestamp: string;
};

export type RuleWeight = {
  key: string;
  weight: number;
  support: number;
  lastUpdatedAt: string;
};

export type WeightUpdate = {
  key: string;
  oldWeight: number;
  newWeight: number;
  delta: number;
  support: number;
  rationale: string;
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

export function tuneRuleWeights(
  outcomes: OutcomeRecord[],
  existing: Record<string, RuleWeight>,
  opts?: { learningRate?: number; minSupport?: number }
): WeightUpdate[] {
  const learningRate = opts?.learningRate ?? 0.15;
  const minSupport = opts?.minSupport ?? 3;

  const buckets = new Map<string, { support: number; correct: number; incorrect: number }>();

  for (const outcome of outcomes) {
    const correctDiagnosis = !!outcome.diagnosisActual && outcome.diagnosisPredicted === outcome.diagnosisActual;
    const correctDisposition = !!outcome.dispositionActual && outcome.dispositionPredicted === outcome.dispositionActual;
    const reward = correctDiagnosis && correctDisposition ? 1 : -1;

    for (const feature of outcome.features) {
      const entry = buckets.get(feature) ?? { support: 0, correct: 0, incorrect: 0 };
      entry.support += 1;
      if (reward > 0) entry.correct += 1;
      else entry.incorrect += 1;
      buckets.set(feature, entry);
    }
  }

  const updates: WeightUpdate[] = [];

  for (const [key, stats] of buckets.entries()) {
    if (stats.support < minSupport) continue;

    const base = existing[key]?.weight ?? 1;
    const performance = (stats.correct - stats.incorrect) / stats.support;
    const delta = learningRate * performance;
    const next = clamp(base + delta, 0.25, 3);

    updates.push({
      key,
      oldWeight: base,
      newWeight: Number(next.toFixed(4)),
      delta: Number((next - base).toFixed(4)),
      support: stats.support,
      rationale: `${stats.correct} correct, ${stats.incorrect} incorrect over ${stats.support} outcomes`,
    });
  }

  return updates.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

export function applyWeightUpdates(
  existing: Record<string, RuleWeight>,
  updates: WeightUpdate[],
  nowIso = new Date().toISOString()
): Record<string, RuleWeight> {
  const next = { ...existing };
  for (const update of updates) {
    next[update.key] = {
      key: update.key,
      weight: update.newWeight,
      support: update.support,
      lastUpdatedAt: nowIso,
    };
  }
  return next;
}
