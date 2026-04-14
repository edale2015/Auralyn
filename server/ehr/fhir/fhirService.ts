import {
  mapInternalEncounterToFhir,
  mapInternalPatientToFhir,
  mapTriageResultToFhirObservations,
  mapTriageResultToFhirDiagnosticReport,
  mapTreatmentToFhirMedicationRequest,
} from "./fhirMapper";
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

    const createdEncounter = await fhirPost<any>("/Encounter", mapInternalEncounterToFhir(input.encounter, fhirPatientId));
    const fhirEncounterId = createdEncounter?.id;

    const observations = mapTriageResultToFhirObservations(input.encounter, fhirPatientId);
    for (const obs of observations) {
      await fhirPost("/Observation", obs);
    }

    const diagnosticReport = mapTriageResultToFhirDiagnosticReport(input.encounter, fhirPatientId, fhirEncounterId);
    await fhirPost("/DiagnosticReport", diagnosticReport);

    const treatments: Array<any> = input.encounter.triageResult?.treatments ?? input.encounter.result?.treatments ?? [];
    const medRequests = treatments.map((t: any) =>
      mapTreatmentToFhirMedicationRequest(
        { name: t.name ?? t.drug ?? t, dose: t.dose, route: t.route, indication: t.indication ?? input.encounter.complaint },
        fhirPatientId,
      )
    );
    for (const med of medRequests) {
      await fhirPost("/MedicationRequest", med);
    }

    return {
      ok: true,
      fhirPatientId,
      fhirEncounterId,
      resourcesCreated: 1 + 1 + observations.length + 1 + medRequests.length,
      resourceTypes: ["Patient", "Encounter", ...observations.map(() => "Observation"), "DiagnosticReport", ...medRequests.map(() => "MedicationRequest")],
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function searchExternalPatientByIdentifier(
  identifier: string,
  _clinicId?: string,   // for future per-tenant FHIR server routing
): Promise<any> {
  return fhirPost<any>(`/Patient/_search`, {
    resourceType: "Parameters",
    parameter: [{ name: "identifier", valueString: identifier }],
  });
}
