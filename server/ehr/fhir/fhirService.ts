import { mapInternalEncounterToFhir, mapInternalPatientToFhir, mapTriageResultToFhirObservations } from "./fhirMapper";
import { fhirPost, isFhirConfigured } from "./fhirClient";

export interface FhirSyncResult {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  fhirPatientId?: string;
  resourcesCreated?: number;
  error?: string;
}

export async function syncEncounterToFhir(input: {
  clinicId: string;
  encounter: any;
  patient: any;
}): Promise<FhirSyncResult> {
  if (!isFhirConfigured()) {
    return { ok: true, skipped: true, reason: "FHIR_BASE_URL not configured — sync skipped" };
  }

  try {
    const createdPatient = await fhirPost<any>("/Patient", mapInternalPatientToFhir(input.patient));
    const fhirPatientId = createdPatient.id;

    await fhirPost("/Encounter", mapInternalEncounterToFhir(input.encounter, fhirPatientId));

    const observations = mapTriageResultToFhirObservations(input.encounter, fhirPatientId);
    for (const obs of observations) {
      await fhirPost("/Observation", obs);
    }

    return {
      ok: true,
      fhirPatientId,
      resourcesCreated: 1 + 1 + observations.length,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function searchExternalPatientByIdentifier(identifier: string): Promise<any> {
  return fhirPost<any>(`/Patient/_search`, {
    resourceType: "Parameters",
    parameter: [{ name: "identifier", valueString: identifier }],
  });
}
