export const Topics = {
  IntakeSessionUpdated:       "intake.session.updated",
  EncounterCreated:           "encounter.created",
  TriageCompleted:            "triage.completed",
  FhirSyncRequested:          "fhir.sync.requested",
  MedicationSafetyRequested:  "medication.safety.requested",
  AuditEvent:                 "audit.event",
  ClaimGenerated:             "billing.claim.generated",
  ClaimSubmitted:             "billing.claim.submitted",
  LearningCycleTriggered:     "learning.cycle.triggered",
} as const;

export type Topic = typeof Topics[keyof typeof Topics];
