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
    case "PATIENT_MESSAGE":
      state.symptoms = ((state.symptoms ?? "") + " " + event.data.message).trim();
      state.intakeMessages = state.intakeMessages ?? [];
      state.intakeMessages.push({ role: "patient", content: event.data.message, timestamp: event.data.timestamp ?? new Date().toISOString() });
      break;
    case "ALERTS_UPDATED":
      state.alerts = event.data.alerts ?? [];
      break;
    case "MEDICATION_PLAN":
      state.medicationPlan = event.data.medication ?? null;
      break;
    case "FOLLOW_UP_QUESTION_ASKED":
      state.followUpQuestions = [...(state.followUpQuestions ?? []), event.data.question];
      break;
    case "UNCERTAINTY_DETECTED":
      state.followUpQuestions = [...(state.followUpQuestions ?? []), event.data.nextQuestion];
      break;
    case "HYBRID_REASONING_COMPLETE":
      state.hybridResult = event.data.result;
      state.lastHybridEvalAt = event.data.timestamp ?? new Date().toISOString();
      if (event.data.result?.disposition && !state.disposition) {
        state.disposition = event.data.result.disposition;
      }
      break;
    case "DISCHARGE_READY":
      state.dischargeText = event.data.text;
      break;
    case "NOTE_READY":
      state.chartNote = event.data.note;
      break;
    case "OUTCOME_RECORDED":
      state.outcomeData = { ...(state.outcomeData ?? {}), ...event.data };
      break;
    case "REWARD_COMPUTED":
      state.outcomeData = { ...(state.outcomeData ?? {}), reward: event.data.reward };
      break;
    case "FOLLOWUP_QUESTION_SUGGESTED":
      state.pendingQuestion = event.data.question ?? null;
      if (event.data.question?.text) {
        state.followUpQuestions = [...(state.followUpQuestions ?? []), event.data.question.text];
      }
      break;
    case "FOLLOWUP_QUESTION_ANSWERED":
      state.pendingQuestion = null;
      state.answeredQuestionIds = [...(state.answeredQuestionIds ?? []), event.data.questionId];
      state.answeredQuestions = [...(state.answeredQuestions ?? []), {
        questionId: event.data.questionId,
        answer: event.data.answer,
        featuresExtracted: event.data.featuresExtracted ?? [],
      }];
      if (event.data.featuresExtracted?.length) {
        const existing = state.structuredFacts ?? {};
        for (const f of event.data.featuresExtracted) {
          existing[f] = true;
        }
        state.structuredFacts = existing;
      }
      break;
    case "CARE_PATHWAY_STARTED":
      state.carePathway = event.data.pathway ?? null;
      break;
  }
}
