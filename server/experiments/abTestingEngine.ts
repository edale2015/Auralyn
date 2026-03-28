import { logMetric } from "../monitoring/metrics";

export type Variant = "A" | "B";
export type ExperimentStatus = "active" | "paused" | "concluded";

export interface Experiment {
  experimentId: string;
  name:         string;
  description:  string;
  hypothesis:   string;
  metricTarget: string;
  status:       ExperimentStatus;
  createdAt:    string;
  startedAt?:   string;
  concludedAt?: string;
  variantA:     { name: string; description: string };
  variantB:     { name: string; description: string };
  results: {
    A: { count: number; correct: number; totalScore: number; avgLatencyMs: number; safetyBlocks: number };
    B: { count: number; correct: number; totalScore: number; avgLatencyMs: number; safetyBlocks: number };
  };
  conclusion?: "A_wins" | "B_wins" | "no_significant_difference";
  pValue?: number;
  winner?: Variant;
}

const experiments: Map<string, Experiment> = new Map();

function generateId(): string {
  return `EXP-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

// Deterministic variant assignment by caseId hash
export function assignVariant(caseId: string, experimentId: string): Variant {
  let hash = 0;
  const key = `${experimentId}:${caseId}`;
  for (let i = 0; i < key.length; i++) {
    hash = (hash << 5) - hash + key.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % 2 === 0 ? "A" : "B";
}

export function createExperiment(input: {
  name: string;
  description: string;
  hypothesis: string;
  metricTarget: string;
  variantA: { name: string; description: string };
  variantB: { name: string; description: string };
}): Experiment {
  const exp: Experiment = {
    experimentId: generateId(),
    name:         input.name,
    description:  input.description,
    hypothesis:   input.hypothesis,
    metricTarget: input.metricTarget,
    status:       "active",
    createdAt:    new Date().toISOString(),
    startedAt:    new Date().toISOString(),
    variantA:     input.variantA,
    variantB:     input.variantB,
    results: {
      A: { count: 0, correct: 0, totalScore: 0, avgLatencyMs: 0, safetyBlocks: 0 },
      B: { count: 0, correct: 0, totalScore: 0, avgLatencyMs: 0, safetyBlocks: 0 },
    },
  };
  experiments.set(exp.experimentId, exp);
  logMetric("experiment.created", 1, "throughput", { name: input.name });
  return exp;
}

export function logABResult(input: {
  experimentId: string;
  caseId:       string;
  variant:      Variant;
  correct:      boolean;
  score:        number;
  latencyMs:    number;
  safetyBlocked?: boolean;
}): void {
  const exp = experiments.get(input.experimentId);
  if (!exp || exp.status !== "active") return;

  const r = exp.results[input.variant];
  r.count++;
  if (input.correct) r.correct++;
  r.totalScore  += input.score;
  r.avgLatencyMs = (r.avgLatencyMs * (r.count - 1) + input.latencyMs) / r.count;
  if (input.safetyBlocked) r.safetyBlocks++;

  logMetric(`experiment.${input.variant}.result`, 1, "throughput", {
    experimentId: input.experimentId,
    correct: String(input.correct),
  });
}

// Two-proportion z-test for statistical significance
export function computeSignificance(exp: Experiment): { pValue: number; significant: boolean; winner?: Variant } {
  const a = exp.results.A;
  const b = exp.results.B;
  if (a.count < 10 || b.count < 10) return { pValue: 1, significant: false };

  const pA = a.correct / a.count;
  const pB = b.correct / b.count;
  const pPool = (a.correct + b.correct) / (a.count + b.count);
  const se = Math.sqrt(pPool * (1 - pPool) * (1 / a.count + 1 / b.count));
  if (se === 0) return { pValue: 1, significant: false };

  const z = Math.abs(pA - pB) / se;
  // Approximate p-value from z-score (two-tailed)
  const pValue = Math.max(0, 2 * (1 - normalCDF(z)));
  const significant = pValue < 0.05;
  const winner: Variant | undefined = significant ? (pA >= pB ? "A" : "B") : undefined;
  return { pValue: Math.round(pValue * 1000) / 1000, significant, winner };
}

function normalCDF(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp(-z * z / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.7814779 + t * (-1.8212560 + t * 1.3302744))));
  return z > 0 ? 1 - p : p;
}

export function concludeExperiment(experimentId: string): Experiment {
  const exp = experiments.get(experimentId);
  if (!exp) throw new Error(`Experiment not found: ${experimentId}`);

  const { pValue, significant, winner } = computeSignificance(exp);
  exp.status       = "concluded";
  exp.concludedAt  = new Date().toISOString();
  exp.pValue       = pValue;
  exp.winner       = winner;
  exp.conclusion   = significant
    ? (winner === "A" ? "A_wins" : "B_wins")
    : "no_significant_difference";

  logMetric("experiment.concluded", 1, "throughput", { conclusion: exp.conclusion });
  return exp;
}

export function getExperiment(id: string): Experiment | undefined {
  return experiments.get(id);
}

export function getAllExperiments(): Experiment[] {
  return Array.from(experiments.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getActiveExperiment(): Experiment | undefined {
  return Array.from(experiments.values()).find(e => e.status === "active");
}

// Seed with a live experiment
(function seed() {
  const exp = createExperiment({
    name:         "Hybrid Scoring v2 vs Bayesian Baseline",
    description:  "Compare the 4-signal hybrid scorer against the Bayesian baseline on ENT/flu cases",
    hypothesis:   "Hybrid scorer improves diagnostic accuracy by ≥5% over Bayesian baseline",
    metricTarget: "diagnostic_accuracy",
    variantA:     { name: "Bayesian Baseline",   description: "Static Bayesian engine only" },
    variantB:     { name: "Hybrid Scorer v2",     description: "Bayes + RLHF + Jaccard similarity" },
  });

  // Populate with simulated results
  const variants: Variant[] = ["A", "B"];
  for (let i = 0; i < 60; i++) {
    const v: Variant = variants[i % 2];
    const correct = v === "B" ? Math.random() < 0.83 : Math.random() < 0.76;
    logABResult({
      experimentId: exp.experimentId,
      caseId:       `seed-${i}`,
      variant:      v,
      correct,
      score:        correct ? 0.8 + Math.random() * 0.15 : 0.4 + Math.random() * 0.2,
      latencyMs:    v === "B" ? 220 + Math.random() * 60 : 140 + Math.random() * 40,
      safetyBlocked: Math.random() < 0.03,
    });
  }
})();
