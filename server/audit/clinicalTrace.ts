/**
 * Clinical Trace Builder (BMAD-style) — 5-stage structured decision trace
 * Every decision maps: input → questions → scoring → diagnosis → disposition
 * Produces a flat, exportable record for FDA submission, legal audit, and RLHF.
 *
 * Different from traceEngine.ts (which is SHA-256 token-level):
 * this is a HIGH-LEVEL human-readable clinical decision trace.
 *
 * FIX (Batch-1 Finding #4 — High): traceId now uses crypto.randomUUID() instead
 * of String(Date.now()). Two concurrent calls within the same millisecond no
 * longer produce identical traceIds, preventing FDA audit record collisions.
 */

import { createHash, randomUUID } from "crypto";
import { logEvent }               from "../ops/auditEvents";

export type TraceStage = "input" | "questions" | "scoring" | "diagnosis" | "disposition";

export interface TraceStep {
  stage:      TraceStage;
  data:       any;
  capturedAt: string;
}

export interface ClinicalTraceRecord {
  traceId:      string;      // UUID — globally unique, collision-free
  traceHash:    string;      // SHA-256 of all steps — tamper evidence
  patientId?:   string;
  steps:        TraceStep[];
  disposition:  string;
  timestamp:    string;
  sealed:       boolean;     // once sealed, cannot be modified
}

export interface BuildTraceInput {
  patientId?:  string;
  symptoms?:   any;
  questions?:  any[];
  scores?:     Record<string, any>;
  diagnosis?:  any;
  disposition: string;
}

function hashSteps(steps: TraceStep[]): string {
  const payload = JSON.stringify(steps, (_, v) =>
    typeof v === "bigint" ? v.toString() : v
  );
  return createHash("sha256").update(payload).digest("hex");
}

export function buildClinicalTrace(input: BuildTraceInput): ClinicalTraceRecord {
  const now = new Date().toISOString();

  const steps: TraceStep[] = [
    { stage: "input",       data: input.symptoms  ?? {},  capturedAt: now },
    { stage: "questions",   data: input.questions ?? [],   capturedAt: now },
    { stage: "scoring",     data: input.scores    ?? {},  capturedAt: now },
    { stage: "diagnosis",   data: input.diagnosis ?? {},  capturedAt: now },
    { stage: "disposition", data: input.disposition,      capturedAt: now },
  ];

  // FIX: randomUUID() — guaranteed unique, not timestamp-based
  const traceId   = randomUUID();
  const traceHash = hashSteps(steps);

  const record: ClinicalTraceRecord = {
    traceId,
    traceHash,
    patientId:   input.patientId,
    steps,
    disposition: input.disposition,
    timestamp:   now,
    sealed:      true,
  };

  logEvent({
    actor:      "clinical_trace",
    action:     "trace:sealed",
    entityType: "patient",
    entityId:   input.patientId ?? "unknown",
    details:    { traceId, traceHash, disposition: input.disposition },
  });

  return record;
}

/** Verify a stored trace has not been tampered with */
export function verifyTrace(record: ClinicalTraceRecord): { valid: boolean; reason?: string } {
  const recomputed = hashSteps(record.steps);
  if (recomputed !== record.traceHash) {
    return { valid: false, reason: `Hash mismatch: expected ${record.traceHash}, got ${recomputed}` };
  }
  return { valid: true };
}

/** Flatten trace to a single row for CSV/FDA export */
export function flattenTrace(record: ClinicalTraceRecord): Record<string, any> {
  const flat: Record<string, any> = {
    traceId:     record.traceId,
    traceHash:   record.traceHash,
    patientId:   record.patientId ?? "",
    timestamp:   record.timestamp,
    disposition: record.disposition,
  };
  for (const step of record.steps) {
    flat[`stage_${step.stage}`] = typeof step.data === "string"
      ? step.data
      : JSON.stringify(step.data);
  }
  return flat;
}
