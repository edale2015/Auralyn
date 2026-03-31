import type { FhirDiagnosticReport, FhirEncounter, FhirMedicationRequest, FhirObservation, FhirPatient } from "./fhirTypes";

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

/**
 * Maps a triage encounter into a FHIR DiagnosticReport that captures the full
 * AI reasoning output — diagnosis, disposition, confidence, red flags, and
 * treatment recommendation — as a structured clinical report.
 */
export function mapTriageResultToFhirDiagnosticReport(
  encounter: any,
  fhirPatientId: string,
  fhirEncounterId?: string,
): FhirDiagnosticReport {
  const result = encounter.triageResult || encounter.result || {};
  const obs = mapTriageResultToFhirObservations(encounter, fhirPatientId);

  const lines: string[] = [];
  if (result.topDiagnosis ?? result.diagnosis)
    lines.push(`Diagnosis: ${result.topDiagnosis ?? result.diagnosis}`);
  if (result.disposition)        lines.push(`Disposition: ${result.disposition}`);
  if (result.confidence != null) lines.push(`Confidence: ${(result.confidence * 100).toFixed(1)}%`);
  if (result.treatment)          lines.push(`Treatment: ${result.treatment}`);
  if (result.redFlags?.length)   lines.push(`Red Flags: ${result.redFlags.join(", ")}`);
  if (result.workup)             lines.push(`Workup: ${JSON.stringify(result.workup)}`);
  if (encounter.complaint)       lines.push(`Chief Complaint: ${encounter.complaint}`);

  const report: FhirDiagnosticReport = {
    resourceType: "DiagnosticReport",
    status: "final",
    code: {
      text: "AI Triage Clinical Summary",
      coding: [
        {
          system: "http://loinc.org",
          code: "11488-4",
          display: "Consult note",
        },
      ],
    },
    subject: { reference: `Patient/${fhirPatientId}` },
    effectiveDateTime: new Date().toISOString(),
    conclusion: lines.join("\n"),
    result: obs.map((_, i) => ({ reference: `#obs-${i}` })),
    presentedForm: lines.length
      ? [
          {
            contentType: "text/plain",
            data: Buffer.from(lines.join("\n")).toString("base64"),
          },
        ]
      : undefined,
  };

  if (fhirEncounterId) {
    (report as any).encounter = { reference: `Encounter/${fhirEncounterId}` };
  }

  return report;
}

/**
 * Maps a treatment recommendation into a FHIR MedicationRequest.
 */
export function mapTreatmentToFhirMedicationRequest(
  treatment: { name: string; dose?: string; route?: string; indication?: string },
  fhirPatientId: string,
): FhirMedicationRequest {
  return {
    resourceType: "MedicationRequest",
    status: "active",
    intent: "order",
    medicationCodeableConcept: { text: treatment.name },
    subject: { reference: `Patient/${fhirPatientId}` },
    dosageInstruction: treatment.dose
      ? [{ text: `${treatment.dose}${treatment.route ? " via " + treatment.route : ""}` }]
      : undefined,
    reasonCode: treatment.indication ? [{ text: treatment.indication }] : undefined,
  };
}
