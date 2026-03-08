import { firestoreCaseStore } from "../firestoreCaseStore";
import { firestoreCaseEventsStore } from "../firestoreCaseEvents";

export interface OutcomeRecord {
  caseId: string;
  finalDiagnosis?: string;
  dispositionOutcome?: string;
  medicationChanges?: string[];
  testResults?: string[];
  outcomeNotes?: string;
  capturedAt: string;
  capturedBy?: string;
}

export async function captureOutcome(input: OutcomeRecord): Promise<OutcomeRecord> {
  await firestoreCaseStore.patchCase(input.caseId, {
    outcome: input as any,
  });

  await firestoreCaseEventsStore.appendEvent({
    caseId: input.caseId,
    type: "CUSTOM",
    actorId: input.capturedBy,
    summary: `Outcome captured: ${input.finalDiagnosis || "No diagnosis specified"}`,
    payload: { outcomeType: "OUTCOME_CAPTURED", ...input },
  });

  return input;
}

export async function getOutcome(caseId: string): Promise<OutcomeRecord | null> {
  const c = await firestoreCaseStore.getCase(caseId);
  return (c as any)?.outcome ?? null;
}
