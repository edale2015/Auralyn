/**
 * server/ehr/ehrOrchestrator.ts — EHR encounter submission (canonical write path)
 *
 * FIX (Code Review Critical Finding #1 + #3):
 *   The original implementation was pure stub theater — runEHRAction() always
 *   returned { success: true, stub: true } with only a console.log, making it
 *   impossible to distinguish from a real EHR write. Three divergent write paths
 *   existed with irreconcilable failure semantics.
 *
 *   Fixed: submitEncounter() now delegates to ehrWriter.ts (the single canonical
 *   write path). ehrWriter throws on failure, surfaces real errors, and writes
 *   an audit record. This file is a thin routing layer, not a write adapter.
 *
 *   DELETED: runEHRAction() stub — no caller should use this pattern.
 *   All callers of the old submitEncounter() now get real failure semantics.
 */

import { ehrWrite, type EHRWritePayload, type EHRWriteResult } from "./ehrWriter";

export interface EHRSubmitResult {
  success:    boolean;
  system:     string;
  stub:       false;      // NEVER true — stub theater removed
  traceId?:   string;
  error?:     string;
  recordedAt: string;
}

/**
 * submitEncounter — single canonical entry point for EHR encounter writes.
 *
 * Delegates to ehrWriter.ts which:
 *   - Throws on failure (no silent success-on-failure)
 *   - Writes audit log on both success and failure
 *   - Only uses mock when NODE_ENV is not production
 */
export async function submitEncounter(
  data: Record<string, unknown>
): Promise<EHRSubmitResult> {
  const payload: EHRWritePayload = {
    patientId:   String(data.patientId   ?? ""),
    disposition: String(data.disposition ?? data.diagnosis ?? ""),
    notes:       String(data.notes       ?? ""),
    physicianId: data.physicianId ? String(data.physicianId) : undefined,
    timestamp:   data.timestamp   ? String(data.timestamp)   : undefined,
    // system: let ehrWriter.ts auto-detect from env vars
  };

  if (!payload.patientId) throw new Error("submitEncounter: patientId is required");
  if (!payload.disposition) throw new Error("submitEncounter: disposition is required");

  // Throws on failure — no silent success path
  const result: EHRWriteResult = await ehrWrite(payload);

  return {
    success:    result.success,
    system:     result.system,
    stub:       false,
    traceId:    data.traceId ? String(data.traceId) : undefined,
    error:      result.error,
    recordedAt: result.recordedAt,
  };
}
