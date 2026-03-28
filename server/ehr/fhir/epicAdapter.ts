/**
 * Epic Sandbox Adapter — FHIR R4 Patient + Encounter CRUD
 *
 * Wraps fhirClient.ts with Epic-specific resource shapes.
 * Works against the Epic sandbox at:
 *   https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4
 * or any FHIR R4-compliant endpoint.
 *
 * Set FHIR_BASE_URL to enable real calls; gracefully no-ops when absent.
 */

import { fhirGet, fhirPost, fhirPut, isFhirConfigured } from "./fhirClient";
import type { FhirPatient, FhirEncounter, FhirObservation } from "./fhirTypes";

// ── Patient ───────────────────────────────────────────────────────────────────

export async function getPatient(patientId: string): Promise<FhirPatient> {
  return fhirGet<FhirPatient>(`/Patient/${patientId}`);
}

export async function searchPatients(params: {
  family?: string;
  given?:  string;
  birthdate?: string;
  identifier?: string;
}): Promise<{ entry?: Array<{ resource: FhirPatient }> }> {
  const q = new URLSearchParams();
  if (params.family)     q.set("family",     params.family);
  if (params.given)      q.set("given",      params.given);
  if (params.birthdate)  q.set("birthdate",  params.birthdate);
  if (params.identifier) q.set("identifier", params.identifier);
  return fhirGet(`/Patient?${q.toString()}`);
}

export async function createPatient(patient: Partial<FhirPatient>): Promise<FhirPatient> {
  return fhirPost<FhirPatient>("/Patient", { resourceType: "Patient", ...patient });
}

export async function updatePatient(patientId: string, patient: Partial<FhirPatient>): Promise<FhirPatient> {
  return fhirPut<FhirPatient>(`/Patient/${patientId}`, { resourceType: "Patient", id: patientId, ...patient });
}

// ── Encounter ─────────────────────────────────────────────────────────────────

export async function getEncounter(encounterId: string): Promise<FhirEncounter> {
  return fhirGet<FhirEncounter>(`/Encounter/${encounterId}`);
}

export async function createEncounter(encounter: Partial<FhirEncounter>): Promise<FhirEncounter> {
  return fhirPost<FhirEncounter>("/Encounter", { resourceType: "Encounter", ...encounter });
}

export async function listEncountersForPatient(
  patientId: string,
  limit = 10
): Promise<{ entry?: Array<{ resource: FhirEncounter }> }> {
  return fhirGet(`/Encounter?patient=${patientId}&_count=${limit}&_sort=-date`);
}

// ── Observation ───────────────────────────────────────────────────────────────

export async function createObservation(obs: Partial<FhirObservation>): Promise<FhirObservation> {
  return fhirPost<FhirObservation>("/Observation", { resourceType: "Observation", ...obs });
}

// ── Capability / Health check ──────────────────────────────────────────────────

export async function getCapabilityStatement(): Promise<any> {
  return fhirGet("/metadata");
}

export function isEpicAdapterConfigured(): boolean {
  return isFhirConfigured();
}
