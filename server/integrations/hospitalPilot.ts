export interface PilotPatient {
  patientId: string;
  complaint: string;
  vitals?: Record<string, number | string>;
  disposition?: string;
}

export interface PilotOutcome {
  patientId: string;
  severity: "critical" | "moderate" | "minor";
  actualDisposition: string;
  feedback?: string;
}

export interface OutcomeLog {
  receivedAt: string;
  outcome: PilotOutcome;
  learningWeight: number;
}

const outcomeBuffer: OutcomeLog[] = [];

export async function sendPilotCase(patient: PilotPatient): Promise<unknown> {
  const apiUrl = process.env.HOSPITAL_PILOT_API;
  const token  = process.env.HOSPITAL_TOKEN;

  if (!apiUrl || !token) {
    return { queued: true, reason: "HOSPITAL_PILOT_API or HOSPITAL_TOKEN not configured" };
  }

  const payload = {
    patientId: patient.patientId,
    complaint: patient.complaint,
    vitals:    patient.vitals ?? {},
    triage:    patient.disposition ?? "UNKNOWN",
  };

  const res = await fetch(apiUrl, {
    method:  "POST",
    headers: {
      Authorization:  `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`Hospital pilot API error: ${res.status} ${res.statusText}`);
  }

  return res.json();
}

export async function receiveOutcome(outcome: PilotOutcome): Promise<boolean> {
  const weight = weightOutcome(outcome);
  const log: OutcomeLog = {
    receivedAt: new Date().toISOString(),
    outcome,
    learningWeight: weight,
  };

  outcomeBuffer.push(log);
  if (outcomeBuffer.length > 500) outcomeBuffer.shift();

  console.log(`[HospitalPilot] Outcome received — patient=${outcome.patientId} severity=${outcome.severity} weight=${weight}`);

  return true;
}

export function getOutcomeBuffer(): OutcomeLog[] {
  return [...outcomeBuffer];
}

function weightOutcome(outcome: PilotOutcome): number {
  return outcome.severity === "critical" ? 5 : outcome.severity === "moderate" ? 2 : 1;
}
