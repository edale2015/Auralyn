import { sendToECWEncounter, type ECWPayload } from "./ecwAdapter";

async function postObservationEpic(patientId: string, token: string, data: unknown): Promise<void> {
  const base = process.env.FHIR_BASE;
  if (!base || !token) { console.log(`[EPIC] unified write skipped — no FHIR_BASE/token`); return; }
  await fetch(`${base}/Observation`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export interface EHRWritePayload {
  patientId: string;
  disposition: string;
  vitals?: Record<string, unknown>;
}

export async function writeEHRAll(data: EHRWritePayload): Promise<{ epic: string; ecw: string }> {
  const token = process.env.EPIC_TOKEN ?? "";
  const results = await Promise.allSettled([
    postObservationEpic(data.patientId, token, {
      code: "Triage Result",
      value: data.disposition,
      unit: "",
    }),
    sendToECWEncounter(data as ECWPayload),
  ]);
  return {
    epic: results[0].status === "fulfilled" ? "ok" : "failed",
    ecw:  results[1].status === "fulfilled" ? "ok" : "failed",
  };
}
