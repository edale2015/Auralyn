// ── Replay Engine ──────────────────────────────────────────────────────────────
//
// Exact reproduction of any clinical decision from its traceId.
// Re-runs the same inputs through the current registered agents and returns
// both the original audit trace and the live replay results for comparison.
//
// FDA / legal use:
//   "What did the system decide for patient P001 on April 4th, and why?"
//   POST /api/replay/:traceId  → original trace + live re-run side by side.
//
// Important constraints:
//   • Replay uses current agent versions, not historical snapshots.
//     For true snapshot replay, freeze agent builds behind feature flags.
//   • The replay fingerprint WILL differ from the original if the execution
//     plan has changed since the original run — this is expected and surfaced
//     in the response.

import { pool }      from "../db";
import { runAgents } from "../agents/orchestrator";
import { logger }    from "../utils/logger";
import { generateExecutionFingerprint } from "../audit/executionFingerprint";

export interface ReplayResult {
  traceId:             string;
  originalTrace:       AuditRow[];
  replayResults:       Record<string, any>;
  replayFingerprint:   string;
  originalFingerprint: string | null;
  planChanged:         boolean;
  replayedAt:          string;
}

interface AuditRow {
  id:        number;
  traceId:   string;
  step:      string;
  input:     unknown;
  output:    unknown;
  metadata:  unknown;
  createdAt: Date;
  hash:      string;
}

export class ReplayEngine {

  async replay(traceId: string): Promise<ReplayResult> {
    // ── 1. Fetch original audit trace ─────────────────────────────────────
    const result = await pool.query<AuditRow>(
      `SELECT id, trace_id AS "traceId", step, input, output, metadata, created_at AS "createdAt", hash
       FROM audit_logs
       WHERE trace_id = $1
       ORDER BY id ASC`,
      [traceId]
    );

    const originalTrace = result.rows;
    if (originalTrace.length === 0) {
      throw new Error(`[ReplayEngine] No audit trace found for traceId: ${traceId}`);
    }

    // ── 2. Reconstruct original context from the first audit step ─────────
    const firstStep = originalTrace[0];
    const originalContext = (firstStep.input as any)?.context ?? {};
    const originalFp: string | null = (firstStep.metadata as any)?.fingerprint ?? null;

    if (!originalContext.text && !originalContext.patientId) {
      logger.warn("[ReplayEngine] First audit step has no context — replay may be incomplete", { traceId });
    }

    // ── 3. Re-run through the current execution pipeline ──────────────────
    const replayResults = await runAgents({
      text:      originalContext.text      ?? "",
      patientId: originalContext.patientId ?? undefined,
      channel:   originalContext.channel   ?? undefined,
      answers:   originalContext.answers   ?? undefined,
      metadata:  { ...originalContext.metadata, replay: true, originalTraceId: traceId },
    });

    // ── 4. Surface plan-changed flag ──────────────────────────────────────
    const planChanged = originalFp !== null && originalFp !== replayResults.fingerprint;

    logger.info("[ReplayEngine] Replay complete", {
      traceId,
      originalSteps:    originalTrace.length,
      planChanged,
      replayFingerprint: replayResults.fingerprint,
    });

    return {
      traceId,
      originalTrace,
      replayResults:       replayResults.results,
      replayFingerprint:   replayResults.fingerprint,
      originalFingerprint: originalFp,
      planChanged,
      replayedAt:          new Date().toISOString(),
    };
  }
}

export const replayEngine = new ReplayEngine();
