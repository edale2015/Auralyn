/**
 * FHIR Integration Service
 * Production-ready stub for Epic/Athena-compatible FHIR R4.
 * Uses FHIR_URL + FHIR_TOKEN env vars when configured.
 */

const FHIR_BASE = process.env.FHIR_URL ?? "";
const FHIR_TOKEN = process.env.FHIR_TOKEN ?? "";

interface FHIRObservation {
  resourceType:  "Observation";
  status:        "final" | "preliminary" | "amended";
  subject:       { reference: string };
  valueString?:  string;
  valueQuantity?: { value: number; unit: string };
  code?:         { text: string };
}

export async function pushFHIR(patientId: string, data: Record<string, any>): Promise<{ ok: boolean; resourceId?: string; error?: string }> {
  if (!FHIR_BASE) {
    return { ok: false, error: "FHIR_URL not configured — observation not pushed (stub mode)" };
  }

  const observation: FHIRObservation = {
    resourceType: "Observation",
    status:       "final",
    subject:      { reference: `Patient/${patientId}` },
    valueString:  JSON.stringify(data),
    code:         { text: data.complaint ?? "clinical_observation" },
  };

  try {
    const { default: fetch } = await import("node-fetch");
    const res = await fetch(`${FHIR_BASE}/Observation`, {
      method:  "POST",
      headers: {
        "Content-Type":  "application/fhir+json",
        "Authorization": `Bearer ${FHIR_TOKEN}`,
      },
      body: JSON.stringify(observation),
    });

    if (!res.ok) {
      return { ok: false, error: `FHIR server responded ${res.status}` };
    }

    const body = await res.json() as any;
    return { ok: true, resourceId: body?.id };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

export async function getPatientFHIR(patientId: string): Promise<{ ok: boolean; data?: any; error?: string }> {
  if (!FHIR_BASE) return { ok: false, error: "FHIR_URL not configured" };

  try {
    const { default: fetch } = await import("node-fetch");
    const res  = await fetch(`${FHIR_BASE}/Patient/${patientId}`, {
      headers: { Authorization: `Bearer ${FHIR_TOKEN}` },
    });
    if (!res.ok) return { ok: false, error: `${res.status}` };
    return { ok: true, data: await res.json() };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
