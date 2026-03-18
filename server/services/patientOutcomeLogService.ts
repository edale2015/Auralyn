export type PatientOutcomeLog = {
  encounterId: string;
  patientIdHash: string;
  complaintId: string;
  system: string;
  diagnosisPredicted?: string;
  diagnosisActual?: string;
  dispositionPredicted?: string;
  dispositionActual?: string;
  redFlagsTriggered: string[];
  ruleIdsTriggered: string[];
  modifierIdsApplied: string[];
  featureKeys: string[];
  createdAt: string;
};

export interface OutcomeLogRepository {
  create(log: PatientOutcomeLog): Promise<void>;
  listRecent(limit: number): Promise<PatientOutcomeLog[]>;
}

export async function writeOutcomeLog(repo: OutcomeLogRepository, log: PatientOutcomeLog) {
  await repo.create(log);
}
