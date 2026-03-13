import { appendOutcomeRecord, type OutcomeCaseRecord } from "../similarity/outcomeCaseMemory"
import { getClinicalState } from "../state/clinicalStateStore"

export interface CaseOutcomeInput {
  caseId: string
  actualDiagnosis?: string
  dispositionMatch?: boolean
  safetyMiss?: boolean
  physicianCorrection?: string
  questionsAsked?: string[]
}

export async function recordCaseOutcome(input: CaseOutcomeInput): Promise<void> {
  const state = getClinicalState(input.caseId)
  const differential = (state.differential ?? []).map((d: any) =>
    typeof d === "string" ? d : d.diagnosis ?? "unknown"
  )
  const topPrediction = differential[0]

  const record: OutcomeCaseRecord = {
    caseId: input.caseId,
    complaint: state.complaint ?? "unknown",
    symptoms: state.symptoms ?? "",
    disposition: state.disposition ?? "unknown",
    differential,
    questionsAsked: input.questionsAsked ?? [],
    actualDiagnosis: input.actualDiagnosis,
    topPredictionMatch: topPrediction
      ? topPrediction === input.actualDiagnosis
      : undefined,
    dispositionMatch: input.dispositionMatch,
    safetyMiss: input.safetyMiss,
    physicianCorrection: input.physicianCorrection,
    patientAgeGroup: state.patient?.age
      ? state.patient.age < 18
        ? "pediatric"
        : state.patient.age < 65
        ? "adult"
        : "elderly"
      : undefined,
    patientSex: state.patient?.sex,
    timestamp: new Date().toISOString(),
  }

  await appendOutcomeRecord(record)
}
