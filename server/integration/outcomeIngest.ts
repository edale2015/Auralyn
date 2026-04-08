import { recordTelemedOutcome, type OutcomeLabel } from "../learning/outcomeLearningService";
import { applyAdaptiveWeights } from "../learning/agentWeighting";

export interface OutcomeIngestPayload {
  caseId: string;
  disposition: string;
  correct: boolean;
  triageLevel: string;
  winningAgent: string;
  actualOutcome?: string;
}

export async function ingestOutcome(event: OutcomeIngestPayload) {
  const label: OutcomeLabel =
    event.correct ? "correct" :
    (event.disposition === "ICU" || event.disposition === "admitted_urgent") && event.triageLevel !== "critical" && event.triageLevel !== "emergency"
      ? "undertriage"
      : (event.triageLevel === "critical" || event.triageLevel === "emergency") && (event.disposition === "discharged")
      ? "overtriage"
      : "incorrect";

  return recordTelemedOutcome({
    caseId: event.caseId,
    finalDecision: event.triageLevel,
    triageLevel: event.triageLevel,
    actualOutcome: event.actualOutcome ?? event.disposition,
    label,
    winningAgent: event.winningAgent,
    timestamp: Date.now(),
  });
}
