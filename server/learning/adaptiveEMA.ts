/**
 * DOMAIN 5 — REC 5.1: Adaptive EMA with Safety Floor
 *
 * Replaces the fixed α=0.1 EMA with an adaptive version that:
 *   - Learns faster when case volume is high and complexity is low
 *   - Learns slower when volume is low (avoids noise from rare events)
 *   - Enforces a minimum weight floor for the Safety Veto Agent
 *
 * This prevents two failure modes:
 *   1. Too slow: a systematically failing agent degrades for weeks
 *   2. Too fast: a single rare correct call inappropriately boosts weight
 *
 * MY ADDITION: Confidence interval tracking. Returns both the point
 * estimate AND a 90% CI so dashboards can show weight uncertainty.
 */

export enum CaseComplexityLevel {
  SIMPLE   = 1.0,   // clear chief complaint, few modifiers
  MODERATE = 1.5,   // multiple complaints or significant modifiers
  COMPLEX  = 2.5,   // multi-system, rare presentation, or pediatric
  CRITICAL = 4.0,   // life-threatening, time-sensitive
}

export interface EMAWeightResult {
  agentId:           string;
  updatedWeight:     number;
  previousWeight:    number;
  alphaUsed:         number;           // adaptive alpha value
  confidenceInterval: [number, number]; // MY ADDITION: 90% CI
  atSafetyFloor:     boolean;
  observations:      number;           // total observations seen so far
}

// Minimum weight floor — Safety agent can never drop below this
const SAFETY_FLOOR_WEIGHT = 0.15;
const BASE_ALPHA           = 0.1;
const MAX_ALPHA_MULTIPLIER = 2.0;   // alpha caps at 2× base

// Track observation counts per agent for CI calculation
const observationCounts: Record<string, number> = {};
const weightHistory: Record<string, number[]>   = {};  // MY ADDITION: for CI
const MAX_HISTORY = 20;

export function computeAdaptiveEMA(
  agentId:        string,
  currentWeight:  number,
  recentAccuracy: number,
  caseVolume:     number,
  complexity:     CaseComplexityLevel = CaseComplexityLevel.MODERATE
): EMAWeightResult {
  // Adaptive alpha: higher volume → learn faster; higher complexity → learn slower
  const volumeFactor  = Math.min(caseVolume / 100, MAX_ALPHA_MULTIPLIER);
  const complexityFactor = 1 / complexity;
  const adaptiveAlpha = Math.min(
    BASE_ALPHA * volumeFactor * complexityFactor,
    BASE_ALPHA * MAX_ALPHA_MULTIPLIER
  );

  let updatedWeight = currentWeight * (1 - adaptiveAlpha) + recentAccuracy * adaptiveAlpha;

  // Safety floor: Safety Veto Agent weight cannot drop below floor
  const atSafetyFloor = agentId.toLowerCase().includes("safety") && updatedWeight < SAFETY_FLOOR_WEIGHT;
  if (atSafetyFloor) {
    updatedWeight = SAFETY_FLOOR_WEIGHT;
  }

  // Track observations and history for CI calculation (MY ADDITION)
  observationCounts[agentId] = (observationCounts[agentId] ?? 0) + 1;
  if (!weightHistory[agentId]) weightHistory[agentId] = [];
  weightHistory[agentId].push(updatedWeight);
  if (weightHistory[agentId].length > MAX_HISTORY) weightHistory[agentId].shift();

  // Compute 90% CI using normal approximation on historical weights
  const history = weightHistory[agentId];
  const ci = computeConfidenceInterval(history, 0.90);

  return {
    agentId,
    updatedWeight,
    previousWeight:    currentWeight,
    alphaUsed:         adaptiveAlpha,
    confidenceInterval: ci,
    atSafetyFloor,
    observations:      observationCounts[agentId],
  };
}

function computeConfidenceInterval(
  values: number[],
  confidence: number
): [number, number] {
  if (values.length < 2) return [0, 1];

  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (values.length - 1);
  const std  = Math.sqrt(variance);
  const se   = std / Math.sqrt(values.length);

  // z-score for 90% CI
  const z = confidence >= 0.99 ? 2.576 : confidence >= 0.95 ? 1.96 : 1.645;
  const margin = z * se;

  return [
    Math.max(0, mean - margin),
    Math.min(1, mean + margin),
  ];
}

export function getAgentWeightHistory(agentId: string): number[] {
  return [...(weightHistory[agentId] ?? [])];
}

export function resetAgentObservations(agentId: string): void {
  delete observationCounts[agentId];
  delete weightHistory[agentId];
}
