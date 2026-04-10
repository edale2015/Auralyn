import { runFinalPipeline, FinalPipelineOutput } from "../clinical/finalPipeline";

export interface EpicFlowResult {
  patientId: string;
  disposition: string;
  topDiagnosis: string;
  confidence: number;
  observationPosted: boolean;
  error?: string;
}

export async function epicFullFlow(
  patientId: string,
  token: string
): Promise<EpicFlowResult> {
  const fhirBase = process.env.FHIR_BASE;
  if (!fhirBase || !token) {
    const triage = runFinalPipeline({ patientId, freeText: "unknown" });
    return {
      patientId,
      disposition: triage.safetyDisposition,
      topDiagnosis: triage.topDiagnosis,
      confidence: triage.confidence,
      observationPosted: false,
      error: "FHIR_BASE or token not configured — triage ran locally",
    };
  }

  let chiefComplaint = "unknown";

  try {
    const patientRes = await fetch(`${fhirBase}/Patient/${patientId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (patientRes.ok) {
      const patient = await patientRes.json();
      chiefComplaint =
        patient?.name?.[0]?.text ??
        patient?.extension?.find((e: any) => e.url?.includes("complaint"))?.valueString ??
        "unknown";
    }
  } catch (e: any) {
    console.warn(`[EpicFullFlow] Patient read failed: ${e?.message}`);
  }

  const triage: FinalPipelineOutput = runFinalPipeline({
    patientId,
    freeText: chiefComplaint,
  });

  const note = {
    resourceType: "Observation",
    status: "final",
    subject: { reference: `Patient/${patientId}` },
    code: { text: "Triage Disposition" },
    valueString: triage.safetyDisposition,
    meta: {
      tag: [{ system: "https://auralyn.ai", code: "auralyn-triage" }],
    },
  };

  let observationPosted = false;
  try {
    const obsRes = await fetch(`${fhirBase}/Observation`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/fhir+json",
      },
      body: JSON.stringify(note),
    });
    observationPosted = obsRes.ok;
    if (!obsRes.ok) {
      console.warn(`[EpicFullFlow] Observation POST failed: ${obsRes.status}`);
    }
  } catch (e: any) {
    console.warn(`[EpicFullFlow] Observation write failed: ${e?.message}`);
  }

  return {
    patientId,
    disposition: triage.safetyDisposition,
    topDiagnosis: triage.topDiagnosis,
    confidence: triage.confidence,
    observationPosted,
  };
}
