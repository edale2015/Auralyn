import type { CaseRecord } from "../../types/case";

export interface MappedEngineState {
  complaintId: string;
  answers: Record<string, unknown>;
  patientAge?: number;
  patientSex?: string;
  durationDays?: number;
  vitalSigns?: Record<string, number>;
  medications?: string[];
  allergies?: string[];
  conditions?: string[];
}

export function mapCaseToEngineState(caseRecord: CaseRecord): MappedEngineState {
  const ctx = caseRecord.patientContext as any ?? {};
  const answers = caseRecord.answers ?? {};

  return {
    complaintId: caseRecord.complaintId,
    answers,
    patientAge: ctx.age ?? answers.Q_AGE as number ?? undefined,
    patientSex: ctx.sex ?? answers.Q_SEX as string ?? undefined,
    durationDays: answers.Q_DURATION_DAYS as number ?? undefined,
    vitalSigns: ctx.vitalSigns,
    medications: ctx.medications ?? [],
    allergies: ctx.allergies ?? [],
    conditions: ctx.conditions ?? [],
  };
}
