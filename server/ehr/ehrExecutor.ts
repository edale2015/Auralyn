/**
 * server/ehr/ehrExecutor.ts — Scope-gated EHR writes (Epic / Athena / ECW)
 *
 * FIX (Code Review Critical Finding #2):
 *   writeEpic() and writeAthena() previously caught errors internally and returned
 *   { written: false, error: "..." } — a resolved promise that looks like success to
 *   executeWithScope. Physicians received no failure signal; audit logged nothing.
 *
 *   Fixed: adapter functions NO LONGER catch errors. They throw on any failure so
 *   executeWithScope sees a real rejection, surfaces the error to the caller, and
 *   the audit chain records the failure. This matches the contract of ehrWriter.ts.
 *
 * All EHR writes still flow through executeWithScope:
 *   - physicianSigned + confidence ≥ 0.9 required for real writes
 *   - Audit log captures every attempt (success and failure)
 *   - Scope violations return PENDING_OVERRIDE (not silent failure)
 */

import { executeWithScope }   from "../execution/executeWithScope";
import { executeOrder }       from "../intervention/orderExecutor";

export interface EHRPayload {
  patientId:       string;
  system?:         "epic" | "athena" | "ecw";
  data:            Record<string, any>;
  physicianSigned?: boolean;
  confidence?:     number;
  orderText?:      string;
}

// ── Write to EHR (scope-gated) ────────────────────────────────────────────────

export async function writeToEHR(payload: EHRPayload) {
  return executeWithScope(
    {
      agentRole: "ehr_agent",
      action:    "write:ehr",
      context:   {
        physicianSigned: payload.physicianSigned ?? false,
        confidence:      payload.confidence      ?? 0,
        system:          payload.system          ?? "mock",
      },
    },
    async () => {
      const system = payload.system ?? "mock";

      // FIX: adapters now throw on failure — executeWithScope sees real rejections
      if (system === "epic")   return await writeEpic(payload);
      if (system === "athena") return await writeAthena(payload);
      if (system === "ecw")    return await writeECW(payload);

      // Dev/test mock
      return {
        written:   true,
        system:    "mock",
        patientId: payload.patientId,
        recordAt:  new Date().toISOString(),
      };
    }
  );
}

// ── Submit order (scope-gated) ────────────────────────────────────────────────

export async function submitOrder(payload: EHRPayload) {
  return executeWithScope(
    {
      agentRole: "ehr_agent",
      action:    "submit:orders",
      context:   {
        physicianSigned: payload.physicianSigned ?? false,
        confidence:      payload.confidence      ?? 0,
      },
    },
    async () => executeOrder(payload.orderText ?? "Unspecified order", payload.patientId)
  );
}

// ── EHR adapter functions — THROW on failure, never swallow ──────────────────
// FIX: No try/catch here. Errors propagate to executeWithScope which logs them
// and surfaces them to the caller. Resolved-but-failed objects are eliminated.

async function writeEpic(payload: EHRPayload): Promise<{ written: true; system: string; status: number }> {
  const url = process.env.EPIC_EHR_URL;
  if (!url) throw new Error("EPIC_EHR_URL not configured — cannot write to Epic EHR");

  const res = await fetch(`${url}/api/fhir/write`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ patientId: payload.patientId, data: payload.data }),
    signal:  AbortSignal.timeout(8000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    // Throw — do not return { written: false }. Caller must know this failed.
    throw new Error(`Epic EHR write failed: HTTP ${res.status} — ${body}`);
  }

  return { written: true, system: "epic", status: res.status };
}

async function writeAthena(payload: EHRPayload): Promise<{ written: true; system: string; status: number }> {
  const url = process.env.ATHENA_EHR_URL;
  if (!url) throw new Error("ATHENA_EHR_URL not configured — cannot write to Athena EHR");

  const res = await fetch(`${url}/api/chart/update`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ patientId: payload.patientId, data: payload.data }),
    signal:  AbortSignal.timeout(8000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Athena EHR write failed: HTTP ${res.status} — ${body}`);
  }

  return { written: true, system: "athena", status: res.status };
}

async function writeECW(payload: EHRPayload): Promise<{ written: true; system: string; status: number }> {
  const url = process.env.ECW_EHR_URL;
  if (!url) throw new Error("ECW_EHR_URL not configured — cannot write to eCW EHR");

  const res = await fetch(`${url}/api/encounter`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ patientId: payload.patientId, data: payload.data }),
    signal:  AbortSignal.timeout(8000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`eCW EHR write failed: HTTP ${res.status} — ${body}`);
  }

  return { written: true, system: "ecw", status: res.status };
}
