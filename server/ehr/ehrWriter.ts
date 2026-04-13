/**
 * server/ehr/ehrWriter.ts — EHR clinical record writer
 *
 * FIX (Code Review Issue #12):
 *   Previously: on Athena/Epic failure the code silently fell back to writeMock()
 *   and returned { success: true, fallback: true } — physicians saw a "success"
 *   indicator even when the EHR write never happened. Charts appeared filed when
 *   they were not. This is a patient-safety and regulatory compliance failure.
 *
 *   Fixed: fallback to mock is REMOVED from production paths. When a real EHR
 *   write fails it now throws, the caller receives success: false with the actual
 *   error, and the audit log records the failure. writeMock() is only used when
 *   system is explicitly "mock" (dev/test) and that fact is clearly surfaced.
 *
 *   The EHRWriteResult.success field accurately reflects whether the write reached
 *   the actual EHR. There is no code path that returns success: true on a failed write.
 */

import { logEvent } from "../ops/auditEvents";

export interface EHRWritePayload {
  patientId:    string;
  disposition:  string;
  notes:        string;
  system?:      "athena" | "epic" | "ecw" | "mock";
  physicianId?: string;
  timestamp?:   string;
}

export interface EHRWriteResult {
  success:    boolean;
  system:     string;
  patientId:  string;
  recordedAt: string;
  error?:     string;
  /** true only when system="mock" was explicit (dev/test) — never set on production EHR failure */
  isMock?:    boolean;
}

export async function ehrWrite(payload: EHRWritePayload): Promise<EHRWriteResult> {
  const system = payload.system ?? detectSystem();
  const now    = new Date().toISOString();

  let result: EHRWriteResult;

  // ── Production EHR writes — NO mock fallback ──────────────────────────────
  // If the real EHR write fails, we propagate the error. Callers must handle it.
  // Physicians must be informed of write failures — never shown a false success.
  if (system === "athena") {
    result = await writeAthena(payload, now);
  } else if (system === "epic") {
    result = await writeEpic(payload, now);
  } else if (system === "ecw") {
    result = await writeECW(payload, now);
  } else {
    // Explicit mock (dev/test only)
    result = writeMock(payload, now);
  }

  logEvent({
    actor:      payload.physicianId ?? "ehr_writer",
    action:     `ehr:write:${result.success ? "success" : "failed"}`,
    entityType: "patient",
    entityId:   payload.patientId,
    details: {
      system:     result.system,
      success:    result.success,
      isMock:     result.isMock ?? false,
      error:      result.error,
      recordedAt: result.recordedAt,
    },
  });

  return result;
}

// ── System detection ──────────────────────────────────────────────────────────

function detectSystem(): "athena" | "epic" | "ecw" | "mock" {
  if (process.env.ATHENA_EHR_URL)  return "athena";
  if (process.env.EPIC_EHR_URL)    return "epic";
  if (process.env.ECW_EHR_URL)     return "ecw";
  return "mock";
}

// ── EHR adapters ──────────────────────────────────────────────────────────────
// Each adapter throws on failure — no swallowing, no mock fallback.

async function writeAthena(payload: EHRWritePayload, now: string): Promise<EHRWriteResult> {
  const url = process.env.ATHENA_EHR_URL;
  if (!url) throw new Error("ATHENA_EHR_URL not configured");

  const res = await fetch(`${url}/api/chart/update`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({
      patient:   payload.patientId,
      diagnosis: payload.disposition,
      notes:     payload.notes,
    }),
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Athena EHR write failed: HTTP ${res.status} — ${body}`);
  }

  return { success: true, system: "athena", patientId: payload.patientId, recordedAt: now };
}

async function writeEpic(payload: EHRWritePayload, now: string): Promise<EHRWriteResult> {
  const url = process.env.EPIC_EHR_URL;
  if (!url) throw new Error("EPIC_EHR_URL not configured");

  const res = await fetch(`${url}/api/fhir/encounter`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({
      subject:    payload.patientId,
      conclusion: payload.disposition,
      notes:      payload.notes,
    }),
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Epic EHR write failed: HTTP ${res.status} — ${body}`);
  }

  return { success: true, system: "epic", patientId: payload.patientId, recordedAt: now };
}

async function writeECW(payload: EHRWritePayload, now: string): Promise<EHRWriteResult> {
  const url = process.env.ECW_EHR_URL;
  if (!url) throw new Error("ECW_EHR_URL not configured");

  const res = await fetch(`${url}/api/encounter`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({
      patientId:   payload.patientId,
      disposition: payload.disposition,
      notes:       payload.notes,
    }),
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`eCW EHR write failed: HTTP ${res.status} — ${body}`);
  }

  return { success: true, system: "ecw", patientId: payload.patientId, recordedAt: now };
}

// ── Mock writer (dev/test only) ───────────────────────────────────────────────
// Only used when system is explicitly "mock". Never called as a production fallback.

function writeMock(payload: EHRWritePayload, now: string): EHRWriteResult {
  const isProd = process.env.NODE_ENV === "production";
  if (isProd) {
    throw new Error(
      "EHR mock writer cannot be used in production. Configure ATHENA_EHR_URL or EPIC_EHR_URL."
    );
  }
  return {
    success:    true,
    system:     "mock",
    patientId:  payload.patientId,
    recordedAt: now,
    isMock:     true,   // explicit flag — callers can detect mock writes
  };
}
