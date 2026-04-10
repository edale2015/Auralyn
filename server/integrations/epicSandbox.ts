import { runFinalPipeline } from "../clinical/finalPipeline";
import { broadcast } from "../control/controlBus";

export interface EpicSandboxResult {
  patientId: string;
  disposition: string;
  observationPosted: boolean;
  fhirPatientCreated: boolean;
  ts: string;
}

export async function epicTestPatientFlow(fhirToken: string): Promise<EpicSandboxResult> {
  const fhirBase = process.env.FHIR_BASE;
  let sandboxPatientId = `sandbox-${Date.now()}`;
  let fhirPatientCreated = false;

  if (fhirBase && fhirToken) {
    try {
      const res = await fetch(`${fhirBase}/Patient`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${fhirToken}`,
          "Content-Type": "application/fhir+json",
        },
        body: JSON.stringify({
          resourceType: "Patient",
          name: [{ given: ["Test"], family: "Patient" }],
        }),
      });
      if (res.ok) {
        const data = await res.json();
        sandboxPatientId = data.id ?? sandboxPatientId;
        fhirPatientCreated = true;
      }
    } catch {
      fhirPatientCreated = false;
    }
  }

  const triage = runFinalPipeline({
    patientId: sandboxPatientId,
    freeText: "chest pain",
  });

  const disposition = triage.safetyDisposition;
  let observationPosted = false;

  if (fhirBase && fhirToken && fhirPatientCreated) {
    try {
      const obsRes = await fetch(`${fhirBase}/Observation`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${fhirToken}`,
          "Content-Type": "application/fhir+json",
        },
        body: JSON.stringify({
          resourceType: "Observation",
          status: "final",
          code: { text: "Triage Result" },
          subject: { reference: `Patient/${sandboxPatientId}` },
          valueString: disposition,
        }),
      });
      observationPosted = obsRes.ok;
    } catch {
      observationPosted = false;
    }
  }

  const result: EpicSandboxResult = {
    patientId: sandboxPatientId,
    disposition,
    observationPosted,
    fhirPatientCreated,
    ts: new Date().toISOString(),
  };

  broadcast("epic_sandbox_test", result);
  return result;
}
