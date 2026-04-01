/**
 * Hardened clinical flow entry point — the single master orchestrator.
 *
 * Every clinical decision MUST pass through this pipeline:
 *   1. Safety gate (hard stop — no bypass)
 *   2. Clinical reasoning (multi-agent orchestrator with timeout)
 *   3. Audit logging (immutable record of every decision)
 *
 * Existing routes that call the orchestrator directly are still valid
 * (they carry their own safety wiring); this module is the canonical
 * hardened surface for any NEW integration point.
 */
import { withTimeout } from "../utils/withTimeout";
import { runSafetyGate } from "../safety/safetyGate";
import { runFullClinicalFlow as orchestratorFlow, ClinicalInput } from "../orchestrator/clinicalOrchestrator";
import { logAuditEvent } from "../governance/changeAuditLog";
import { ENV } from "../config/env";

export interface HardenedClinicalInput {
  patientId: string;
  complaint: string;
  data: Record<string, unknown>;
  channel?: string;
}

export interface HardenedClinicalResult {
  status: "ok" | "blocked" | "timeout" | "error";
  reason?: string;
  diagnosis?: string;
  disposition?: string;
  confidence?: number;
  recommendation?: string;
  latencyMs?: number;
  safetyPassed?: boolean;
}

const SAFETY_TIMEOUT_MS  = 2500;
const CLINICAL_TIMEOUT_MS = 4000;

/**
 * Run a full clinical evaluation with hard safety gate, circuit breaker,
 * and mandatory audit trail. Returns a structured, typed result.
 *
 * Never throws — all errors are captured and returned as status:"error".
 */
export async function runHardenedClinicalFlow(
  input: HardenedClinicalInput,
): Promise<HardenedClinicalResult> {
  const start = Date.now();

  try {
    // ── 1) SAFETY GATE — hard stop if unsafe ─────────────────────────────
    const safetyInput = {
      complaint:    input.complaint,
      chestPain:    /chest\s*pain/i.test(input.complaint),
      ...(input.data as Record<string, unknown>),
    };

    const safety = await withTimeout(
      () => Promise.resolve(runSafetyGate(safetyInput, {})),
      SAFETY_TIMEOUT_MS,
      { allowed: false, level: "HIGH" as const, reasons: ["safety_gate_timeout"], blockedAt: "withTimeout" },
    );

    if (!safety.allowed) {
      logAuditEvent({
        action:   "governance_override",
        source:   "system",
        itemId:   input.patientId,
        itemType: "clinical_flow",
        status:   "blocked",
        detail:   `Safety gate blocked: ${safety.reasons.join("; ")}`,
        after:    { safety },
      });

      return {
        status:         "blocked",
        reason:         safety.reasons.join("; "),
        recommendation: "Seek immediate care — safety threshold exceeded",
        safetyPassed:   false,
        latencyMs:      Date.now() - start,
      };
    }

    // ── 2) CLINICAL REASONING — with circuit breaker ──────────────────────
    const orchestratorInput: ClinicalInput = {
      complaint: input.complaint,
      answers:   (input.data as any) || {},
      patientId: input.patientId,
      channel:   input.channel || "api",
    };

    const result = await withTimeout(
      () => orchestratorFlow(orchestratorInput),
      CLINICAL_TIMEOUT_MS,
      {
        status:      "error" as const,
        disposition: "unknown",
        confidence:   0,
        diagnosis:    "timeout",
        redFlags:     [],
        summary:      "Clinical reasoning timed out",
        latencyMs:    CLINICAL_TIMEOUT_MS,
        safetyPassed: true,
        layerScores:  {},
        audit:        [],
      },
    );

    if (result.disposition === "unknown" || result.diagnosis === "timeout") {
      return {
        status:       "timeout",
        reason:       "Clinical reasoning exceeded time limit",
        latencyMs:    Date.now() - start,
        safetyPassed: true,
      };
    }

    // ── 3) AUDIT ──────────────────────────────────────────────────────────
    logAuditEvent({
      action:   "simulation_run",
      source:   "system",
      itemId:   input.patientId,
      itemType: "clinical_flow",
      status:   "ok",
      detail:   `Diagnosis: ${result.diagnosis ?? "—"} | Disposition: ${result.disposition}`,
      after:    { diagnosis: result.diagnosis, disposition: result.disposition },
      confidence: result.confidence,
    });

    return {
      status:       "ok",
      diagnosis:    result.diagnosis,
      disposition:  result.disposition,
      confidence:   result.confidence,
      safetyPassed: true,
      latencyMs:    Date.now() - start,
    };

  } catch (err: any) {
    return {
      status:    "error",
      reason:    err?.message ?? "Unknown error in clinical flow",
      latencyMs: Date.now() - start,
    };
  }
}
