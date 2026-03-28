import { getAllWeights } from "./weightStore";
import { isCurrentVersionLocked } from "../release/releaseManager";

/**
 * Learning Guard — prevents unsafe or invalid RLHF weight updates.
 * Returns true if the weight update is safe to apply.
 */
export function allowWeightUpdate(result: any): boolean {
  // Never learn from BLOCKED outputs
  if (result.status === "BLOCKED") return false;

  // Never learn from safety-critical misclassifications on high-risk complaints
  const complaint = (result.input?.complaint ?? "").toLowerCase();
  const highRiskComplaints = ["chest_pain", "severe_headache", "stroke", "anaphylaxis", "shortness_of_breath"];
  if (highRiskComplaints.includes(complaint) && result.correct === false) return false;

  // Never learn from outputs with missing trace (unauditable)
  if (!Array.isArray(result.trace)) return false;

  // Never learn if confidence is extremely low (random noise)
  if (typeof result.confidence === "number" && result.confidence < 0.2) return false;

  return true;
}

/**
 * Checks whether learning is frozen for the current version.
 */
export function isLearningFrozen(): boolean {
  try {
    return isCurrentVersionLocked();
  } catch {
    return false;
  }
}

export function getLearningGuardStatus() {
  const weights = getAllWeights();
  const weightCount = Object.keys(weights).length;
  return {
    frozen: isLearningFrozen(),
    weightCount,
    highestWeight: Math.max(...Object.values(weights), 1.0),
    lowestWeight:  Math.min(...Object.values(weights), 1.0),
    weights: Object.entries(weights).slice(0, 10).map(([k, v]) => ({ key: k, value: Number(v.toFixed(3)) })),
  };
}
