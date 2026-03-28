export interface EngineScore { diagnosis: string; score: number; }

/* ── Static prior map (ENT/flu focused) ──────────────────── */
const symptomDxMap: Record<string, string[]> = {
  dysuria:              ["uti", "pyelonephritis"],
  urinary_frequency:   ["uti"],
  cough:               ["pneumonia", "bronchitis", "covid", "upper_respiratory"],
  fever:               ["pneumonia", "uti", "pharyngitis", "covid", "influenza"],
  sore_throat:         ["pharyngitis", "tonsillitis", "strep"],
  chest_pain:          ["acute_coronary_syndrome", "pulmonary_embolism", "pneumonia"],
  shortness_of_breath: ["pulmonary_embolism", "pneumonia", "asthma"],
  diaphoresis:         ["acute_coronary_syndrome", "sepsis"],
  headache:            ["meningitis", "migraine", "sinusitis"],
  stiff_neck:          ["meningitis"],
  ear_pain:            ["otitis_media", "otitis_externa"],
  nasal_congestion:    ["sinusitis", "rhinitis", "upper_respiratory"],
  runny_nose:          ["upper_respiratory", "rhinitis", "influenza"],
  body_aches:          ["influenza", "covid", "viral_syndrome"],
  loss_of_smell:       ["covid", "sinusitis"],
  loss_of_taste:       ["covid"],
  fatigue:             ["influenza", "covid", "viral_syndrome", "strep"],
  chills:              ["influenza", "pneumonia", "sepsis"],
};

/* ── Adaptive learned counts (dx → feature → count) ─────── */
const learnedCounts: Map<string, Record<string, number>> = new Map();

/** Record a confirmed dx + its associated features for future inference */
export function trainBayes(dx: string, features: string[]) {
  const entry = learnedCounts.get(dx) ?? {};
  for (const f of features) {
    entry[f] = (entry[f] ?? 0) + 1;
  }
  learnedCounts.set(dx, entry);
}

/** Bayesian likelihood score using learned counts (Laplace-smoothed) */
export function computeBayesScore(dx: string, features: string[]): number {
  const entry = learnedCounts.get(dx) ?? {};
  let score = 1;
  for (const f of features) {
    score *= (entry[f] ?? 0) + 0.1;   // Laplace smoothing
  }
  return score;
}

/** Static prior-based inference (original behaviour preserved) */
export function bayesianEngine(symptoms: string[]): EngineScore[] {
  const scores: Record<string, number> = {};
  for (const s of symptoms) {
    const dxList = symptomDxMap[s] ?? [];
    dxList.forEach((dx, i) => {
      scores[dx] = (scores[dx] ?? 0) + 1 / (i + 1);
    });
  }
  return Object.entries(scores)
    .map(([diagnosis, score]) => ({ diagnosis, score }))
    .sort((a, b) => b.score - a.score);
}

/** Learned count snapshot for observability */
export function getBayesSnapshot() {
  const map: Record<string, Record<string, number>> = {};
  learnedCounts.forEach((v, k) => { map[k] = v; });
  return { learnedDiagnoses: learnedCounts.size, counts: map };
}
