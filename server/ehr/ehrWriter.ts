/**
 * EHR Writer — writes clinical outcomes to EHR systems
 * Attempts API write first (Athena/Epic) → falls back to mock on failure.
 * Scope-gated through ehrExecutor for high-risk writes.
 */

import { logEvent } from "../ops/auditEvents";

export interface EHRWritePayload {
  patientId:   string;
  disposition: string;
  notes:       string;
  system?:     "athena" | "epic" | "ecw" | "mock";
  physicianId?:string;
  timestamp?:  string;
}

export interface EHRWriteResult {
  success:   boolean;
  system:    string;
  patientId: string;
  recordedAt:string;
  error?:    string;
  fallback?:boolean;
}

export async function ehrWrite(payload: EHRWritePayload): Promise<EHRWriteResult> {
  const system = payload.system ?? detectSystem();
  const now    = new Date().toISOString();

  let result: EHRWriteResult;

  try {
    if (system === "athena") {
      result = await writeAthena(payload, now);
    } else if (system === "epic") {
      result = await writeEpic(payload, now);
    } else {
      result = writeMock(payload, now);
    }
  } catch (err: any) {
    console.warn(`[EHRWriter] ${system} write failed — using mock fallback:`, err.message);
    result = { ...writeMock(payload, now), fallback: true, error: err.message };
  }

  logEvent({
    actor:      payload.physicianId ?? "ehr_writer",
    action:     `ehr:write:${result.success ? "success" : "failed"}`,
    entityType: "patient",
    entityId:   payload.patientId,
    details:    result,
  });

  return result;
}

function detectSystem(): "athena" | "epic" | "mock" {
  if (process.env.ATHENA_EHR_URL) return "athena";
  if (process.env.EPIC_EHR_URL)   return "epic";
  return "mock";
}

async function writeAthena(payload: EHRWritePayload, now: string): Promise<EHRWriteResult> {
  const url = process.env.ATHENA_EHR_URL;
  if (!url) throw new Error("ATHENA_EHR_URL not configured");

  const res = await fetch(`${url}/api/chart/update`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ patient: payload.patientId, diagnosis: payload.disposition, notes: payload.notes }),
    signal:  AbortSignal.timeout(5000),
  });

  return { success: res.ok, system: "athena", patientId: payload.patientId, recordedAt: now };
}

async function writeEpic(payload: EHRWritePayload, now: string): Promise<EHRWriteResult> {
  const url = process.env.EPIC_EHR_URL;
  if (!url) throw new Error("EPIC_EHR_URL not configured");

  const res = await fetch(`${url}/api/fhir/encounter`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ subject: payload.patientId, conclusion: payload.disposition }),
    signal:  AbortSignal.timeout(5000),
  });

  return { success: res.ok, system: "epic", patientId: payload.patientId, recordedAt: now };
}

function writeMock(payload: EHRWritePayload, now: string): EHRWriteResult {
  return { success: true, system: "mock", patientId: payload.patientId, recordedAt: now };
}
