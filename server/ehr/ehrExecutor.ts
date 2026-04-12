/**
 * EHR Executor — scope-gated EHR writes (Epic / Athena / ECW)
 * ALL EHR writes flow through the scope engine before execution.
 * Without physician_signed + confidence ≥ 0.9 → returns PENDING_OVERRIDE.
 */

import { executeWithScope }   from "../execution/executeWithScope";
import { executeOrder }       from "../intervention/orderExecutor";

export interface EHRPayload {
  patientId:      string;
  system?:        "epic" | "athena" | "ecw";
  data:           Record<string, any>;
  physicianSigned?:boolean;
  confidence?:    number;
  orderText?:     string;
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

      if (system === "epic")   return writeEpic(payload);
      if (system === "athena") return writeAthena(payload);
      if (system === "ecw")    return writeECW(payload);

      // Mock EHR for dev/test
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

// ── EHR adapter stubs (replace with real client in production) ────────────────
async function writeEpic(payload: EHRPayload) {
  const url = process.env.EPIC_EHR_URL;
  if (!url) return { written: false, system: "epic", error: "EPIC_EHR_URL not configured" };
  try {
    const res  = await fetch(`${url}/api/fhir/write`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patientId: payload.patientId, data: payload.data }),
      signal: AbortSignal.timeout(4000),
    });
    return { written: res.ok, system: "epic", status: res.status };
  } catch (err: any) {
    return { written: false, system: "epic", error: err.message };
  }
}

async function writeAthena(payload: EHRPayload) {
  const url = process.env.ATHENA_EHR_URL;
  if (!url) return { written: false, system: "athena", error: "ATHENA_EHR_URL not configured" };
  try {
    const res = await fetch(`${url}/api/chart/update`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patientId: payload.patientId, data: payload.data }),
      signal: AbortSignal.timeout(4000),
    });
    return { written: res.ok, system: "athena", status: res.status };
  } catch (err: any) {
    return { written: false, system: "athena", error: err.message };
  }
}

async function writeECW(payload: EHRPayload) {
  return { written: false, system: "ecw", error: "ECW adapter not yet configured" };
}
