import { buildFeatures, normalizeFeatures, type RawInput, type ClinicalFeatures } from "./featureStore";

const W = {
  bias:              -1.2,
  age:                0.8,
  sbp:               -0.9,
  spo2:              -2.0,
  hr:                 0.6,
  rr:                 1.1,
  temp:               0.4,
  chestPain:          1.3,
  sob:                1.1,
  diaphoresis:        0.9,
  confusion:          1.6,
  fever:              0.5,
  immunocompromised:  1.2,
  ageOver65:          0.7,
  ageOver80:          1.0,
  dbp:               -0.3,
};

export type RiskLevel = "low" | "medium" | "high";

export interface MLPrediction {
  probability:  number;
  risk:         RiskLevel;
  topFactors:   Array<{ feature: string; contribution: number }>;
  modelVersion: string;
}

function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-z));
}

export function predictAdmission(input: RawInput): MLPrediction {
  const raw  = buildFeatures(input);
  const norm = normalizeFeatures(raw);

  let z = W.bias;
  const contribs: Array<{ feature: string; contribution: number }> = [];

  for (const [k, w] of Object.entries(W)) {
    if (k === "bias") continue;
    const val = norm[k] ?? 0;
    const c   = w * val;
    z += c;
    if (Math.abs(c) > 0.01) contribs.push({ feature: k, contribution: c });
  }

  contribs.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
  const p = sigmoid(z);

  return {
    probability:  Math.round(p * 1000) / 1000,
    risk:         p > 0.7 ? "high" : p > 0.4 ? "medium" : "low",
    topFactors:   contribs.slice(0, 5),
    modelVersion: "logistic-v1.0",
  };
}

export function explainPrediction(input: RawInput): { weights: typeof W; features: ClinicalFeatures; normalized: Record<string, number> } {
  const features   = buildFeatures(input);
  const normalized = normalizeFeatures(features);
  return { weights: W, features, normalized };
}

export async function trainModel(rows: RawInput[]): Promise<{ status: string; count: number }> {
  console.log(`[ML] Training requested on ${rows.length} rows — queued for offline trainer`);
  return { status: "queued", count: rows.length };
}

export function dataDrift(baseline: RawInput[], current: RawInput[]): { drift: boolean; metric: string; delta: number; threshold: number } {
  const THRESHOLD = 3;

  const meanSpo2 = (arr: RawInput[]) => {
    const vals = arr.map(r => r.vitals?.oxygenSaturation ?? 98);
    return vals.reduce((a, b) => a + b, 0) / Math.max(1, vals.length);
  };

  const b     = meanSpo2(baseline);
  const c     = meanSpo2(current);
  const delta = Math.abs(c - b);

  return { drift: delta > THRESHOLD, metric: "spo2_mean", delta: Math.round(delta * 10) / 10, threshold: THRESHOLD };
}
