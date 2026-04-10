import { fastTriageFlow } from "../patient/fastTriage";

export function scheduleFollowup(patientId: string, delayMinutes: number): void {
  const followupTime = new Date(Date.now() + delayMinutes * 60_000).toISOString();
  console.log(`[FollowUp] Patient ${patientId} → follow-up scheduled at ${followupTime}`);
}

export async function dispatchEMS(location?: string): Promise<void> {
  console.log(`[EMS] Dispatching to: ${location ?? "unknown"}`);
}

export async function liveClinic(patient: Record<string, any>): Promise<{
  disposition?: string;
  ask?: string;
  durationMs: number;
  path: string;
  emsDispatched: boolean;
}> {
  const triage = await fastTriageFlow(patient);
  let emsDispatched = false;

  if (triage.disposition === "ER_NOW") {
    await dispatchEMS(patient.location);
    emsDispatched = true;
  }

  scheduleFollowup(patient.patientId ?? "unknown", 60);

  return { ...triage, emsDispatched };
}
