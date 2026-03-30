/**
 * Autonomous Pipeline Wrapper
 *
 * Thin orchestration layer that:
 *   1. Calls the real runFullClinicalFlow (9-stage pipeline v1.2.0)
 *   2. Enriches the result with unified metadata (requestId, timing, pipeline tag)
 *   3. Emits a PIPELINE_COMPLETE event to the Control Tower event bus
 *
 * Does NOT touch any core clinical logic — pure wrapper.
 */

import crypto from "crypto";
import { runFullClinicalFlow } from "../orchestrator/clinicalOrchestrator";
import { emitEvent }           from "../controlTower/eventBus";

export async function runAutonomousPipeline(ctx: any) {
  const start     = Date.now();
  const requestId = crypto.randomUUID();

  try {
    const result = await runFullClinicalFlow(ctx.input || ctx);

    const durationMs = Date.now() - start;

    const enriched = {
      ...result,
      _meta: {
        pipeline:  "autonomous_v1.2.0",
        requestId,
        durationMs,
        timestamp: Date.now(),
        stages:    9,
      },
    };

    emitEvent({
      type:      "PIPELINE_COMPLETE",
      payload:   { requestId, durationMs, success: true },
      timestamp: Date.now(),
    });

    return enriched;

  } catch (err: any) {
    emitEvent({
      type:      "PIPELINE_ERROR",
      payload:   { requestId, error: err.message },
      timestamp: Date.now(),
    });

    return {
      error:   "pipeline_failed",
      message: err.message,
      _meta:   {
        pipeline:  "autonomous_v1.2.0",
        requestId,
        failed:    true,
        durationMs: Date.now() - start,
      },
    };
  }
}
