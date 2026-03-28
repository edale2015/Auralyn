import type { FhirEncounter, FhirObservation, FhirPatient } from "./fhirTypes";

export function mapInternalPatientToFhir(patient: any): FhirPatient {
  return {
    resourceType: "Patient",
    identifier: patient.externalPatientId
      ? [{ system: "urn:external-patient-id", value: patient.externalPatientId }]
      : undefined,
    name: [{ family: patient.lastName ?? patient.name, given: [patient.firstName ?? "Unknown"] }],
    telecom: [
      patient.phone ? { system: "phone", value: patient.phone } : undefined,
      patient.email ? { system: "email", value: patient.email } : undefined,
    ].filter(Boolean) as Array<{ system?: string; value?: string }>,
    birthDate: patient.dob || undefined,
    gender: patient.sex || undefined,
  };
}

export function mapInternalEncounterToFhir(encounter: any, fhirPatientId: string): FhirEncounter {
  return {
    resourceType: "Encounter",
    status: "finished",
    class: {
      system: "http://terminology.hl7.org/CodeSystem/v3-ActCode",
      code: "AMB",
    },
    subject: { reference: `Patient/${fhirPatientId}` },
    reasonCode: [{ text: encounter.complaint || encounter.chiefComplaint }],
  };
}

export function mapTriageResultToFhirObservations(
  encounter: any,
  fhirPatientId: string
): FhirObservation[] {
  const result = encounter.triageResult || encounter.result || {};
  return [
    result.topDiagnosis || result.diagnosis
      ? {
          resourceType: "Observation" as const,
          status: "final",
          code: { text: "AI top diagnosis" },
          subject: { reference: `Patient/${fhirPatientId}` },
          valueString: String(result.topDiagnosis ?? result.diagnosis),
        }
      : undefined,
    result.disposition
      ? {
          resourceType: "Observation" as const,
          status: "final",
          code: { text: "AI disposition" },
          subject: { reference: `Patient/${fhirPatientId}` },
          valueString: String(result.disposition),
        }
      : undefined,
    result.confidence !== undefined
      ? {
          resourceType: "Observation" as const,
          status: "final",
          code: { text: "AI confidence score" },
          subject: { reference: `Patient/${fhirPatientId}` },
          valueString: String(result.confidence),
        }
      : undefined,
  ].filter(Boolean) as FhirObservation[];
}
