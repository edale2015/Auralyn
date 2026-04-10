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
