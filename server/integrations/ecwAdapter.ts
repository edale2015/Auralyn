import type { EhrAdapter, EhrPatientContext, EhrWritePayload } from "./ehr/types";

async function postObservation(patientId: string, token: string, data: unknown): Promise<void> {
  const base = process.env.FHIR_BASE;
  if (!base || !token) { console.log(`[EPIC] postObservation skipped — no FHIR_BASE/token`); return; }
  await fetch(`${base}/Observation`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export interface ECWPayload {
  patientId: string;
  disposition: string;
  vitals?: Record<string, unknown>;
  [key: string]: unknown;
}

export async function sendToECWEncounter(data: ECWPayload): Promise<{ success: boolean; data?: unknown }> {
  const url = process.env.ECW_API;
  const token = process.env.ECW_TOKEN;
  if (!url || !token) {
    console.log(`[ECW] No ECW_API/ECW_TOKEN configured — skipping encounter push for ${data.patientId}`);
    return { success: false, data: null };
  }
  const payload = { patientId: data.patientId, note: data.disposition, vitals: data.vitals ?? {} };
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`ECW failed: ${res.status}`);
  return { success: true, data: await res.json() };
}

export async function safeEHR<T>(fn: (data: T) => Promise<unknown>, data: T): Promise<"ok" | "queued"> {
  try {
    await fn(data);
    return "ok";
  } catch {
    setTimeout(() => fn(data).catch(() => {}), 1000);
    return "queued";
  }
}

export async function syncSystems(data: ECWPayload): Promise<{ ecw: string; epic: string }> {
  const epicToken = process.env.EPIC_TOKEN ?? "";
  const [ecwResult] = await Promise.allSettled([
    sendToECWEncounter(data),
    postObservation(data.patientId, epicToken, data as any),
  ]);
  return {
    ecw: ecwResult.status === "fulfilled" ? "ok" : "failed",
    epic: epicToken ? "ok" : "skipped",
  };
}

export const ecwAdapter: EhrAdapter = {
  system: "ecw",

  async getPatientContext(patientId: string): Promise<EhrPatientContext> {
    const url = process.env.ECW_API;
    const token = process.env.ECW_TOKEN;
    if (!url || !token) throw new Error("ECW not configured: ECW_API and ECW_TOKEN required");

    const res = await fetch(`${url}/patient/${patientId}`, {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    });
    if (!res.ok) throw new Error(`ECW patient read failed: ${res.status}`);
    const patient = await res.json();

    return {
      patientId,
      firstName: patient?.firstName,
      lastName: patient?.lastName,
      dob: patient?.dob,
      sex: patient?.sex,
      allergies: patient?.allergies || [],
      medications: patient?.medications || [],
      problems: patient?.problems || [],
      raw: patient,
    };
  },

  async writeEncounter(payload: EhrWritePayload): Promise<unknown> {
    const result = await sendToECWEncounter({
      patientId: payload.patientId,
      disposition: payload.disposition || payload.note || "Clinical encounter",
      vitals: payload.vitals,
      ...payload,
    } as ECWPayload);
    if (!result.success) throw new Error("ECW write failed: not configured or API error");
    return result;
  },

  async writeObservation(payload: EhrWritePayload): Promise<unknown> {
    const url = process.env.ECW_API;
    const token = process.env.ECW_TOKEN;
    if (!url || !token) throw new Error("ECW not configured");
    const res = await fetch(`${url}/observation`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ patientId: payload.patientId, vitals: payload.vitals, note: payload.note }),
    });
    if (!res.ok) throw new Error(`ECW observation failed: ${res.status}`);
    return res.json();
  },

  async ping(): Promise<boolean> {
    const url = process.env.ECW_API;
    const token = process.env.ECW_TOKEN;
    if (!url || !token) return false;
    try {
      const res = await fetch(`${url}/health`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return res.ok;
    } catch {
      return false;
    }
  },
};
