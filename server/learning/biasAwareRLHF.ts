import { canLearn } from "../release/modelFreeze";
import { logSecureEvent } from "../ops/secureAudit";

export type OutcomeType = "confirmed_correct" | "confirmed_wrong" | "adverse" | "pending";
export type WeightAction = "INCREASE" | "DECREASE" | "HOLD" | "NO_UPDATE" | "BLOCKED";

export interface WeightUpdateResult {
  action: WeightAction;
  weight?: number;
  reason: string;
  diagnosisKey?: string;
  demographics?: Record<string, any>;
}

const weightDeltas: Record<string, number> = {};

export function updateWeights(input: {
  ai: string;
  physician: string;
  outcome: OutcomeType;
  diagnosisKey?: string;
  demographics?: Record<string, any>;
}): WeightUpdateResult {
  const { ai, physician, outcome, diagnosisKey, demographics } = input;

  if (!canLearn()) {
    return { action: "BLOCKED", reason: "model_frozen" };
  }

  if (!outcome || outcome === "pending") {
    return { action: "NO_UPDATE", reason: "no_outcome_data" };
  }

  if (outcome === "confirmed_correct") {
    const weight = +0.1;
    if (diagnosisKey) weightDeltas[diagnosisKey] = (weightDeltas[diagnosisKey] ?? 0) + weight;

    logSecureEvent({ type: "RLHF_WEIGHT_UPDATE", action: "INCREASE", diagnosisKey, weight, demographics });
    return { action: "INCREASE", weight, reason: "outcome_confirmed_correct", diagnosisKey, demographics };
  }

  if (outcome === "confirmed_wrong" || outcome === "adverse") {
    const weight = -0.2;
    if (diagnosisKey) weightDeltas[diagnosisKey] = (weightDeltas[diagnosisKey] ?? 0) + weight;

    logSecureEvent({ type: "RLHF_WEIGHT_UPDATE", action: "DECREASE", diagnosisKey, weight, outcome, demographics });
    return { action: "DECREASE", weight, reason: `outcome_${outcome}`, diagnosisKey, demographics };
  }

  return { action: "HOLD", reason: "outcome_ambiguous" };
}

export function getWeightDeltas(): Record<string, number> {
  return { ...weightDeltas };
}

export function getWeightStats() {
  const keys = Object.keys(weightDeltas);
  const updates = keys.length;
  const avgDelta = updates > 0 ? +(Object.values(weightDeltas).reduce((a, b) => a + b, 0) / updates).toFixed(4) : 0;
  return { active: true, updates, avgDelta };
}
