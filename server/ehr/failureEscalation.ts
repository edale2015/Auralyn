/**
 * failureEscalation.ts — EHR Write Failure Escalation Engine
 *
 * Called whenever a clinical EHR write fails after all retries.
 * Responsibilities:
 *  1. Log a high-severity audit event (never suppress)
 *  2. Publish a real-time alert via the event bus (if available)
 *  3. Return a structured escalation payload to the caller
 *
 * Callers (clinicalWriteOrchestrator) are responsible for:
 *  - Preventing patient discharge until failure is acknowledged
 *  - Displaying the escalation to the physician UI
 */

import { logEvent } from "../ops/auditEvents";

export interface WriteFailureContext {
  clinicId:    string;
  patientId:   string;
  physicianId: string;
  step:        "ehr_write" | "fhir_sync" | "audit";
  extra?:      Record<string, unknown>;
}

export interface EscalationResult {
  requiresImmediateAttention: boolean;
  escalationId:               string;
  error:                      string;
  context:                    WriteFailureContext;
  timestamp:                  string;
}

export async function handleWriteFailure(
  error: Error,
  context: WriteFailureContext
): Promise<EscalationResult> {
  const escalationId = `esc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const timestamp    = new Date().toISOString();

  // ── Always audit the failure ──────────────────────────────────────────────
  logEvent({
    actor:      context.physicianId,
    action:     "clinical.write.FAILED",
    entityType: "patient",
    entityId:   context.patientId,
    details: {
      clinicId:     context.clinicId,
      step:         context.step,
      escalationId,
      errorMessage: error.message,
      ...context.extra,
    },
  });

  const result: EscalationResult = {
    requiresImmediateAttention: true,
    escalationId,
    error:     error.message,
    context,
    timestamp,
  };

  // ── Attempt real-time broadcast (non-blocking) ────────────────────────────
  try {
    // Dynamic import to avoid circular dependency with eventBus
    const mod = await import("../realtime/eventBus").catch(() => null);
    if (mod?.eventBus) {
      mod.eventBus.emit("broadcast", {
        type:      "EHR_WRITE_FAILURE",
        payload:   result,
        timestamp: timestamp,
      });
    }
  } catch {
    // Event bus unavailable — escalation already captured in audit log
  }

  console.error(
    `[failureEscalation] CRITICAL EHR WRITE FAILURE | ` +
    `escalationId=${escalationId} | ` +
    `patient=${context.patientId} | ` +
    `step=${context.step} | ` +
    `error=${error.message}`
  );

  return result;
}
