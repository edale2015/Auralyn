import { createClinicPatient } from "../repos/clinicPatientRepo";
import { createClinicEncounter, updateClinicEncounter } from "../repos/clinicEncounterRepo";
import { createClinicIntakeSession, updateClinicIntakeSession } from "../repos/clinicIntakeSessionRepo";
import { publishEncounterCreated, publishTriageCompleted, publishFhirSyncRequested } from "../events/publisher";
import type { StartIntakeInput, SubmitIntakeStepInput, IntakeStepResult } from "./intakeTypes";

export async function startIntake(
  clinicExternalId: string,
  input: StartIntakeInput
): Promise<any> {
  const session = await createClinicIntakeSession({
    clinicExternalId,
    channel: input.channel,
    sessionState: "awaiting_consent",
    payload: input as Record<string, unknown>,
  });
  return session;
}

export async function submitIntakeStep(
  clinicExternalId: string,
  input: SubmitIntakeStepInput,
  runFullClinicalFlow: (payload: any) => Promise<any>
): Promise<IntakeStepResult> {
  // Step 1 — consent not yet given
  if (!input.consented) {
    const session = await updateClinicIntakeSession(clinicExternalId, input.sessionId, {
      sessionState: "awaiting_consent",
      payload: { ...input } as Record<string, unknown>,
    });
    return { session, next: "consent" };
  }

  // Step 2 — complaint not yet collected
  if (!input.complaint) {
    const session = await updateClinicIntakeSession(clinicExternalId, input.sessionId, {
      consented: true,
      sessionState: "collecting_complaint",
      payload: { ...input } as Record<string, unknown>,
    });
    return { session, next: "complaint" };
  }

  // Step 3 — full triage flow
  const patient = await createClinicPatient({
    clinicExternalId,
    firstName: input.firstName || "Unknown",
    lastName:  input.lastName  || "Unknown",
    dob:   input.dob,
    phone: input.phone,
    email: input.email,
  });

  const encounter = await createClinicEncounter({
    clinicExternalId,
    patientId: patient.id,
    complaint: input.complaint,
    encounterStatus: "intake_in_progress",
    intakePayload: {
      complaint: input.complaint,
      symptoms: input.symptoms || [],
      freeText:  input.freeText  || "",
      state:     input.state     || "NY",
    } as Record<string, unknown>,
  });

  await publishEncounterCreated({
    clinicId:    clinicExternalId,
    encounterId: String(encounter.id),
    patientId:   String(patient.id),
  });

  const triageResult = await runFullClinicalFlow({
    patientId:   patient.id,
    encounterId: encounter.id,
    complaint:   input.complaint,
    symptoms:    input.symptoms || [],
    freeText:    input.freeText || "",
    state:       input.state   || "NY",
  });

  const updated = await updateClinicEncounter(clinicExternalId, encounter.id, {
    encounterStatus: "triage_complete",
    triageResult: triageResult as Record<string, unknown>,
  });

  await publishTriageCompleted({
    clinicId:    clinicExternalId,
    encounterId: String(encounter.id),
    patientId:   String(patient.id),
  });

  await publishFhirSyncRequested({
    clinicId:  clinicExternalId,
    encounter: updated as unknown as Record<string, unknown>,
    patient:   patient  as unknown as Record<string, unknown>,
  });

  const session = await updateClinicIntakeSession(clinicExternalId, input.sessionId, {
    consented:   true,
    sessionState: "complete",
    patientId:   patient.id,
    payload: { ...input } as Record<string, unknown>,
  });

  return { session, next: "complete", patient, encounter: updated, triageResult };
}
