import { getClinicalState } from "./clinicalStateStore";

export function projectEvent(caseId: string, event: { type: string; data: Record<string, any> }): void {
  const state = getClinicalState(caseId);

  switch (event.type) {
    case "SESSION_STARTED":
      if (event.data.patient) state.patient = event.data.patient;
      break;
    case "SYMPTOMS_RECORDED":
      state.symptoms = event.data.symptoms;
      if (event.data.message) {
        state.intakeMessages = state.intakeMessages ?? [];
        state.intakeMessages.push({ role: "patient", content: event.data.message, timestamp: new Date().toISOString() });
      }
      break;
    case "COMPLAINT_IDENTIFIED":
      state.complaint = event.data.complaint;
      break;
    case "MODIFIER_CAPTURED":
      state.modifiers = { ...(state.modifiers ?? {}), ...event.data.modifiers };
      state.structuredFacts = { ...(state.structuredFacts ?? {}), ...event.data.facts };
      break;
    case "RED_FLAG_DETECTED":
      state.redFlags = [...(state.redFlags ?? []), ...event.data.flags];
      break;
    case "DIFFERENTIAL_UPDATED":
      state.differential = event.data.differential;
      break;
    case "SCORE_COMPUTED":
      state.scores = { ...(state.scores ?? {}), ...event.data.scores };
      break;
    case "DISPOSITION_SET":
      state.disposition = event.data.disposition;
      break;
    case "PATHWAY_EXECUTED":
      state.pathway = event.data.pathway;
      break;
    case "RISK_ASSESSED":
      state.riskAssessment = event.data.riskAssessment;
      break;
    case "COPILOT_SUGGESTION":
      state.copilotSuggestions = event.data.suggestions;
      break;
    case "OUTCOME_RECORDED":
      state.outcomeData = { ...(state.outcomeData ?? {}), ...event.data };
      break;
    case "REWARD_COMPUTED":
      state.outcomeData = { ...(state.outcomeData ?? {}), reward: event.data.reward };
      break;
  }
}
