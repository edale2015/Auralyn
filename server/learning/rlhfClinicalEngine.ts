/**
 * RLHF Clinical Learning Engine — outcome-based self-improvement
 * Evaluates predicted vs actual disposition, computes reward signal,
 * and applies FDA-safe bounded weight updates (±2% cap per update).
 */

import { getRedisAsync } from "../queue/redis";

export type OutcomeLabel = "improved" | "worsened" | "hospitalized" | "discharged" | "icu";

export interface CaseOutcome {
  patientId:             string;
  predictedDisposition:  string;
  actualDisposition:     string;
  predictedRisk:         string;
  actualRisk?:           string;
  outcome:               OutcomeLabel;
  physicianOverride?:    boolean;
  overrideReason?:       string;
  recordedAt?:           string;
}

export interface RLHFUpdate {
  reward:     number;
  adjustment: number;
  capped:     boolean;
  feature:    string;
  recordedAt: string;
}

// In-memory outcome buffer (Redis-persisted in production)
const outcomeLog: CaseOutcome[] = [];
const MAX_LOG = 2000;

// ── Reward function ───────────────────────────────────────────────────────────
export function evaluateCase(c: CaseOutcome): number {
  let reward = 0;

  // Disposition accuracy
  const correct = c.predictedDisposition.toLowerCase() === c.actualDisposition.toLowerCase();
  reward += correct ? 1 : -1;

  // Outcome-based reward
  if (c.outcome === "improved")      reward += 1;
  if (c.outcome === "discharged")    reward += 0.5;
  if (c.outcome === "worsened")      reward -= 2;
  if (c.outcome === "hospitalized")  reward -= 1.5;
  if (c.outcome === "icu")           reward -= 3;

  // Physician override penalty (system was wrong)
  if (c.physicianOverride) reward -= 1;

  return reward;
}

// ── Safe weight update (FDA-bounded: ±2% per case) ───────────────────────────
const MAX_CHANGE  = 0.02;
const LEARN_RATE  = 0.01;

const inMemoryWeights: Record<string, number> = {
  risk_score_weight:        1.0,
  sepsis_weight:            1.0,
  hypoxia_weight:           1.0,
  tachycardia_weight:       1.0,
  disposition_confidence:   1.0,
};

export async function updateClinicalWeights(reward: number, feature = "risk_score_weight"): Promise<RLHFUpdate> {
  const raw       = reward * LEARN_RATE;
  const adjustment = Math.max(Math.min(raw, MAX_CHANGE), -MAX_CHANGE);
  const capped     = Math.abs(raw) > MAX_CHANGE;

  // Update in-memory weight
  inMemoryWeights[feature] = (inMemoryWeights[feature] ?? 1.0) + adjustment;

  // Persist to Redis when available
  try {
    const redis = await getRedisAsync();
    if (redis) {
      await redis.set(
        `rlhf:weight:${feature}`,
        String(inMemoryWeights[feature])
      );
    }
  } catch {
    // Non-blocking — Redis unavailable
  }

  const update: RLHFUpdate = {
    reward,
    adjustment,
    capped,
    feature,
    recordedAt: new Date().toISOString(),
  };

  console.log(`[RLHF] Update — reward:${reward.toFixed(2)} adj:${adjustment.toFixed(4)} cap:${capped} feature:${feature}`);
  return update;
}

// ── Full learning loop ────────────────────────────────────────────────────────
export async function runLearningLoop(caseData: CaseOutcome): Promise<{ reward: number; update: RLHFUpdate; caseOutcome: CaseOutcome }> {
  const full: CaseOutcome = { ...caseData, recordedAt: new Date().toISOString() };

  if (outcomeLog.length >= MAX_LOG) outcomeLog.shift();
  outcomeLog.push(full);

  const reward = evaluateCase(full);

  // Determine most relevant feature to update
  const feature =
    caseData.outcome === "icu"         ? "sepsis_weight"        :
    caseData.outcome === "worsened"    ? "risk_score_weight"    :
    caseData.physicianOverride         ? "disposition_confidence" :
    "risk_score_weight";

  const update = await updateClinicalWeights(reward, feature);
  return { reward, update, caseOutcome: full };
}

export function getWeights(): Record<string, number> {
  return { ...inMemoryWeights };
}

export function getOutcomeLog(): CaseOutcome[] {
  return [...outcomeLog];
}

export function getLearningStats() {
  const total   = outcomeLog.length;
  if (total === 0) return { total: 0, avgReward: 0, positiveRate: 0 };

  const rewards  = outcomeLog.map(evaluateCase);
  const avgReward = rewards.reduce((a, b) => a + b, 0) / total;
  const positiveRate = rewards.filter((r) => r > 0).length / total;

  return { total, avgReward: Math.round(avgReward * 100) / 100, positiveRate: Math.round(positiveRate * 100) / 100, weights: getWeights() };
}
