import type { EhrAdapter, EhrPatientContext, EhrWritePayload } from "./ehr/types";

function optionalEnv(name: string): string | undefined {
  return process.env[name];
}

async function epicFhirFetch(
  path: string,
  init: RequestInit = {},
  token?: string
): Promise<any> {
  const base = optionalEnv("FHIR_BASE");
  const authToken = token || optionalEnv("EPIC_TOKEN");

  if (!base || !authToken) {
    throw new Error("Epic not configured: FHIR_BASE and EPIC_TOKEN required");
  }

  const isWriting = init.method === "POST" || init.method === "PUT";
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${authToken}`,
      "Content-Type": isWriting ? "application/fhir+json" : "application/json",
      ...((init.headers as Record<string, string>) || {}),
    },
  });

  if (!res.ok) {
    throw new Error(`Epic FHIR error ${res.status}: ${await res.text()}`);
  }

  return res.json();
}

export async function postObservation(
  patientId: string,
  token: string,
  data: { code?: string; value?: string; note?: string }
): Promise<unknown> {
  const body = {
    resourceType: "Observation",
    status: "final",
    subject: { reference: `Patient/${patientId}` },
    code: { text: data.code || "Observation" },
    valueString: data.value ?? data.note ?? "",
  };

  return epicFhirFetch(`/Observation`, { method: "POST", body: JSON.stringify(body) }, token);
}

export const epicAdapter: EhrAdapter = {
  system: "epic",

  async getPatientContext(patientId: string, token?: string): Promise<EhrPatientContext> {
    const patient = await epicFhirFetch(`/Patient/${patientId}`, { method: "GET" }, token);

    return {
      patientId,
      firstName: patient?.name?.[0]?.given?.[0],
      lastName: patient?.name?.[0]?.family,
      dob: patient?.birthDate,
      sex: patient?.gender,
      raw: patient,
    };
  },

  async writeEncounter(payload: EhrWritePayload, token?: string): Promise<unknown> {
    const body = {
      resourceType: "Encounter",
      status: "in-progress",
      subject: { reference: `Patient/${payload.patientId}` },
      reasonCode: payload.disposition ? [{ text: payload.disposition }] : undefined,
    };

    return epicFhirFetch(`/Encounter`, { method: "POST", body: JSON.stringify(body) }, token);
  },

  async writeObservation(payload: EhrWritePayload, token?: string): Promise<unknown> {
    const authToken = token || optionalEnv("EPIC_TOKEN") || "";
    return postObservation(payload.patientId, authToken, {
      code: "Triage Result",
      value: payload.disposition || payload.note || "",
    });
  },

  async ping(token?: string): Promise<boolean> {
    try {
      await epicFhirFetch(`/Patient/1`, { method: "GET" }, token);
      return true;
    } catch {
      return false;
    }
  },
};
