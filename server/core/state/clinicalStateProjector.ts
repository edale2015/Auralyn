import { readEventsByCaseId } from "../events/eventStream"

export async function rebuildClinicalState(caseId: string): Promise<Record<string, any>> {
  const events = await readEventsByCaseId(caseId)

  const state: Record<string, any> = {
    caseId,
    events,
    symptoms: "",
    complaint: null,
    differential: [],
    alerts: [],
    redFlags: [],
    disposition: null,
    medicationPlan: null,
    chartNote: null,
    dischargeText: null,
    pathway: null,
    followUpQuestions: [],
    pendingQuestion: null,
    answeredQuestions: [],
    hybridResult: null,
    patient: null,
    intakeMessages: [],
  }

  for (const event of events) {
    const p = event.payload ?? (event as any).data ?? {}

    switch (event.type) {
      case "SESSION_STARTED":
        if (p.patient) state.patient = p.patient
        if (p.complaint) state.complaint = p.complaint
        break

      case "PATIENT_MESSAGE":
        state.symptoms = ((state.symptoms ?? "") + " " + (p.message ?? "")).trim()
        state.intakeMessages.push({
          role: "patient",
          content: p.message,
          timestamp: event.timestamp,
        })
        break

      case "COMPLAINT_IDENTIFIED":
        state.complaint = p.complaint
        break

      case "DIFFERENTIAL_UPDATED":
        state.differential = p.differential ?? []
        break

      case "ALERTS_UPDATED":
        state.alerts = p.alerts ?? []
        break

      case "RED_FLAG_DETECTED":
        state.redFlags = [...new Set([...(state.redFlags ?? []), ...(p.flags ?? [])])]
        break

      case "MEDICATION_PLAN":
        state.medicationPlan = p.medication
        break

      case "DISPOSITION_SET":
        state.disposition = p.disposition
        break

      case "NOTE_READY":
        state.chartNote = p.note
        break

      case "DISCHARGE_READY":
        state.dischargeText = p.text
        break

      case "HYBRID_REASONING_COMPLETE":
        state.hybridResult = p.result
        if (p.result?.disposition && !state.disposition) {
          state.disposition = p.result.disposition
        }
        break

      case "UNCERTAINTY_DETECTED":
        if (p.nextQuestion) {
          state.followUpQuestions.push(p.nextQuestion)
        }
        break

      case "FOLLOWUP_QUESTION_SUGGESTED":
        state.pendingQuestion = p.question
        if (p.question?.text) state.followUpQuestions.push(p.question.text)
        break

      case "FOLLOWUP_QUESTION_ANSWERED":
        state.pendingQuestion = null
        state.answeredQuestions.push({ questionId: p.questionId, answer: p.answer })
        break

      case "CARE_PATHWAY_STARTED":
        state.pathway = p.pathway
        break

      case "PATHWAY_EXECUTED":
        state.pathway = p.result
        break

      case "SIMILARITY_COMPUTED":
        state.similarCases = p.similarCases
        state.similaritySummary = p.summary
        break

      case "OUTCOME_RECORDED":
        state.outcome = p
        break
    }
  }

  return state
}
