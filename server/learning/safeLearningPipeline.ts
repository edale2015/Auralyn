import { isLocked } from "./driftControl";
import { detectConfirmationBias } from "./confirmationBiasGuard";
import { updateWeights, OutcomeType } from "./biasAwareRLHF";
import { recordDispositionSync, getEscalationStats } from "../clinical/escalationGuard";
import { canLearn } from "../release/modelFreeze";
import { logSecureEvent } from "../ops/secureAudit";

export type SafeLearningStatus = "UPDATED" | "BLOCKED" | "SKIPPED" | "HELD" | "ADJUSTED";

export interface SafeLearningResult {
  status: SafeLearningStatus;
  reason: string;
  action?: string;
  weight?: number;
  escalationAdjusted?: boolean;
  pipelineStage: string;
}

let totalRuns = 0;
let updateCount = 0;
let blockCount = 0;

export function safeLearning(input: {
  ai: string;
  physician: string;
  outcome: OutcomeType;
  disposition: string;
  diagnosisKey?: string;
  demographics?: Record<string, any>;
  testOrdered?: boolean;
  aiSuggested?: boolean;
  testResult?: string;
}): SafeLearningResult {
  totalRuns++;

  if (!canLearn() || isLocked()) {
    blockCount++;
    logSecureEvent({ type: "SAFE_LEARNING_BLOCKED", reason: !canLearn() ? "model_frozen" : "drift_locked" });
    return { status: "BLOCKED", reason: !canLearn() ? "model_frozen" : "model_drift_locked", pipelineStage: "gate" };
  }

  const bias = detectConfirmationBias({
    testOrdered: input.testOrdered,
    aiSuggested: input.aiSuggested,
    testResult: input.testResult,
    aiDiagnosis: input.ai,
  });

  if (bias.flagged) {
    blockCount++;
    return { status: "SKIPPED", reason: bias.reason, pipelineStage: "confirmation_bias_guard" };
  }

  recordDispositionSync(input.disposition);
  const escalation = getEscalationStats();

  const weightResult = updateWeights({
    ai: input.ai,
    physician: input.physician,
    outcome: input.outcome,
    diagnosisKey: input.diagnosisKey,
    demographics: input.demographics,
  });

  if (weightResult.action === "NO_UPDATE" || weightResult.action === "BLOCKED") {
    return {
      status: "HELD",
      reason: weightResult.reason,
      escalationAdjusted: escalation.adjust,
      pipelineStage: "weight_engine",
    };
  }

  updateCount++;

  return {
    status: "UPDATED",
    reason: "all_gates_passed",
    action: weightResult.action,
    weight: weightResult.weight,
    escalationAdjusted: escalation.adjust,
    pipelineStage: "complete",
  };
}

export function getSafeLearningStats() {
  return {
    active: true,
    totalRuns,
    updateCount,
    blockCount,
    updateRate: totalRuns > 0 ? +(updateCount / totalRuns).toFixed(3) : 0,
  };
}
