/**
 * DOMAIN 5 — REC 5.1: Adaptive EMA with Safety Floor
 *
 * CLAUDE REVIEW ADDITIONS (Round 2):
 *   - Alpha floor: 0.01 minimum — EMA never stalls at caseVolume=0
 *   - OUTCOME_SEVERITY_ALPHA_MULTIPLIER — ER_NOW learns 2x slower (conservatism)
 *   - Raise SAFETY_FLOOR_WEIGHT from 0.15 → 0.20 (meaningful voice)
 *   - SAFETY_FLOOR_TRIGGER_ALERT at 0.25 — alert if weight drops below
 *   - SAFETY_FLOOR_PAUSE_SYSTEM at 0.18 — pause new cases if this low
 */

export enum CaseComplexityLevel {
  SIMPLE   = 1.0,
  MODERATE = 1.5,
  COMPLEX  = 2.5,
  CRITICAL = 4.0,
}

export interface EMAWeightResult {
  agentId:            string;
  updatedWeight:      number;
  previousWeight:     number;
  alphaUsed:          number;
  confidenceInterval: [number, number];
  atSafetyFloor:      boolean;
  atAlertThreshold:   boolean;    // Claude rec: weight below alert threshold
  observations:       number;
}

// Claude rec: raise safety floor from 0.15 → 0.20
const SAFETY_FLOOR_WEIGHT        = 0.20;
const SAFETY_FLOOR_TRIGGER_ALERT = 0.25;  // Alert medical director if weight drops below
const SAFETY_FLOOR_PAUSE_SYSTEM  = 0.18;  // Pause new cases — Safety Agent too weak to be meaningful

const BASE_ALPHA          = 0.1;
const MIN_ALPHA           = 0.01;  // Claude rec: floor — EMA always updates at least a little
const MAX_ALPHA_MULTIPLIER = 2.0;

/**
 * Claude rec: slower learning rate for higher-acuity dispositions.
 * ER_NOW accuracy should update conservatively — too fast = noisy policy.
 * Caruana et al. (clinical online learning): stratify by outcome severity.
 */
export const OUTCOME_SEVERITY_ALPHA_MULTIPLIER: Record<string, number> = {
  CALL_911:       0.5,   // never auto-learn this tier — conservative
  ER_NOW:         0.5,   // learn 2x slower — false negatives are existential
  ER_URGENT:      0.7,
  URGENT_CARE:    1.0,
  TELEHEALTH_NOW: 1.0,
  NEXT_DAY:       1.0,
  ROUTINE:        1.0,
  SELF_CARE:      1.0,
};

const observationCounts: Record<string, number> = {};
const weightHistory:      Record<string, number[]> = {};
const MAX_HISTORY = 20;

export function computeAdaptiveEMA(
  agentId:          string,
  currentWeight:    number,
  recentAccuracy:   number,
  caseVolume:       number,
  complexity:       CaseComplexityLevel = CaseComplexityLevel.MODERATE,
  outcomeSeverity?: string    // Claude rec: outcome-specific multiplier
): EMAWeightResult {
  const volumeFactor     = Math.min(caseVolume / 100, MAX_ALPHA_MULTIPLIER);
  const complexityFactor = 1 / complexity;
  const severityMult     = outcomeSeverity
    ? (OUTCOME_SEVERITY_ALPHA_MULTIPLIER[outcomeSeverity] ?? 1.0)
    : 1.0;

  // Claude rec: alpha floor of 0.01 — never zero even at caseVolume=0
  const adaptiveAlpha = Math.max(
    MIN_ALPHA,
    Math.min(
      BASE_ALPHA * volumeFactor * complexityFactor * severityMult,
      BASE_ALPHA * MAX_ALPHA_MULTIPLIER
    )
  );

  let updatedWeight = currentWeight * (1 - adaptiveAlpha) + recentAccuracy * adaptiveAlpha;

  const isSafetyAgent = agentId.toLowerCase().includes("safety");
  const atSafetyFloor = isSafetyAgent && updatedWeight < SAFETY_FLOOR_WEIGHT;
  const atAlertThreshold = isSafetyAgent && updatedWeight < SAFETY_FLOOR_TRIGGER_ALERT;

  if (atSafetyFloor) {
    updatedWeight = SAFETY_FLOOR_WEIGHT;
  }

  observationCounts[agentId] = (observationCounts[agentId] ?? 0) + 1;
  if (!weightHistory[agentId]) weightHistory[agentId] = [];
  weightHistory[agentId].push(updatedWeight);
  if (weightHistory[agentId].length > MAX_HISTORY) weightHistory[agentId].shift();

  const history = weightHistory[agentId];
  const ci = computeConfidenceInterval(history, 0.90);

  return {
    agentId,
    updatedWeight,
    previousWeight:     currentWeight,
    alphaUsed:          adaptiveAlpha,
    confidenceInterval: ci,
    atSafetyFloor,
    atAlertThreshold,
    observations:       observationCounts[agentId],
  };
}

function computeConfidenceInterval(values: number[], confidence: number): [number, number] {
  if (values.length < 2) return [0, 1];
  const mean     = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (values.length - 1);
  const std      = Math.sqrt(variance);
  const se       = std / Math.sqrt(values.length);
  const z        = confidence >= 0.99 ? 2.576 : confidence >= 0.95 ? 1.96 : 1.645;
  const margin   = z * se;
  return [Math.max(0, mean - margin), Math.min(1, mean + margin)];
}

export function getAgentWeightHistory(agentId: string): number[] {
  return [...(weightHistory[agentId] ?? [])];
}

export function resetAgentObservations(agentId: string): void {
  delete observationCounts[agentId];
  delete weightHistory[agentId];
}

/** Returns true if Safety Agent weight is dangerously low — system should pause intake */
export function isSafetyAgentPauseThresholdBreached(currentWeight: number): boolean {
  return currentWeight < SAFETY_FLOOR_PAUSE_SYSTEM;
}

export { SAFETY_FLOOR_WEIGHT, SAFETY_FLOOR_TRIGGER_ALERT, SAFETY_FLOOR_PAUSE_SYSTEM };
