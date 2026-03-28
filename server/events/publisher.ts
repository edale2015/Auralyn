import { publish } from "./bus";
import { Topics } from "./topics";

export async function publishEncounterCreated(payload: Record<string, unknown>): Promise<string> {
  return publish(Topics.EncounterCreated, payload);
}

export async function publishTriageCompleted(payload: Record<string, unknown>): Promise<string> {
  return publish(Topics.TriageCompleted, payload);
}

export async function publishFhirSyncRequested(payload: Record<string, unknown>): Promise<string> {
  return publish(Topics.FhirSyncRequested, payload);
}

export async function publishMedicationSafetyRequested(payload: Record<string, unknown>): Promise<string> {
  return publish(Topics.MedicationSafetyRequested, payload);
}

export async function publishAuditEvent(payload: Record<string, unknown>): Promise<string> {
  return publish(Topics.AuditEvent, payload);
}

export async function publishClaimGenerated(payload: Record<string, unknown>): Promise<string> {
  return publish(Topics.ClaimGenerated, payload);
}

export async function publishClaimSubmitted(payload: Record<string, unknown>): Promise<string> {
  return publish(Topics.ClaimSubmitted, payload);
}
