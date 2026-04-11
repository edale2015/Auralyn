import type { EhrAdapter, EhrPatientContext, EhrWritePayload } from "./ehr/types";

function optionalEnv(name: string): string | undefined {
  return process.env[name];
}

async function athenaFetch(
  path: string,
  init: RequestInit = {},
  token?: string
): Promise<any> {
  const base = optionalEnv("ATHENA_API_BASE");
  const practiceId = optionalEnv("ATHENA_PRACTICE_ID");
  const authToken = token || optionalEnv("ATHENA_TOKEN");

  if (!base || !practiceId || !authToken) {
    throw new Error("Athena not configured: ATHENA_API_BASE, ATHENA_PRACTICE_ID, ATHENA_TOKEN required");
  }

  const res = await fetch(`${base}/${practiceId}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${authToken}`,
      "Content-Type": "application/json",
      ...((init.headers as Record<string, string>) || {}),
    },
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Athena API error ${res.status}: ${text}`);
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export const athenaAdapter: EhrAdapter = {
  system: "athena",

  async getPatientContext(patientId: string, token?: string): Promise<EhrPatientContext> {
    const patient = await athenaFetch(`/patients/${patientId}`, { method: "GET" }, token);

    let allergies: string[] = [];
    let medications: string[] = [];
    let problems: string[] = [];

    try {
      const allergyRes = await athenaFetch(`/patients/${patientId}/allergies`, { method: "GET" }, token);
      allergies = Array.isArray(allergyRes?.allergies)
        ? allergyRes.allergies.map((a: any) => a?.allergen || a?.name).filter(Boolean)
        : [];
    } catch {}

    try {
      const medRes = await athenaFetch(`/patients/${patientId}/medications`, { method: "GET" }, token);
      medications = Array.isArray(medRes?.medications)
        ? medRes.medications.map((m: any) => m?.medication || m?.name).filter(Boolean)
        : [];
    } catch {}

    try {
      const probRes = await athenaFetch(`/patients/${patientId}/problems`, { method: "GET" }, token);
      problems = Array.isArray(probRes?.problems)
        ? probRes.problems.map((p: any) => p?.problem || p?.name).filter(Boolean)
        : [];
    } catch {}

    return {
      patientId,
      firstName: patient?.firstname,
      lastName: patient?.lastname,
      dob: patient?.dob,
      sex: patient?.sex,
      allergies,
      medications,
      problems,
      raw: patient,
    };
  },

  async writeEncounter(payload: EhrWritePayload, token?: string): Promise<unknown> {
    const deptId = optionalEnv("ATHENA_DEFAULT_DEPARTMENT_ID") || "1";
    const body = {
      patientid: payload.patientId,
      departmentid: deptId,
      reasonforvisit: payload.disposition || "Clinical triage encounter",
      encounterdate: new Date().toISOString().slice(0, 10),
      note: payload.note || payload.disposition || "",
    };

    return athenaFetch(`/chart/encounters`, {
      method: "POST",
      body: JSON.stringify(body),
    }, token);
  },

  async writeObservation(payload: EhrWritePayload, token?: string): Promise<unknown> {
    const body = {
      patientid: payload.patientId,
      observations: Object.entries(payload.vitals || {}).map(([name, value]) => ({
        name,
        value: String(value),
      })),
      note: payload.note || payload.disposition || "",
    };

    return athenaFetch(`/chart/observations`, {
      method: "POST",
      body: JSON.stringify(body),
    }, token);
  },

  async ping(token?: string): Promise<boolean> {
    try {
      await athenaFetch(`/patients/1`, { method: "GET" }, token);
      return true;
    } catch {
      return false;
    }
  },
};
