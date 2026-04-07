import { sql } from "drizzle-orm";
import { db } from "../db";
import { improvementCycleLog } from "../../shared/schema";
import { evaluateAndImprove, applyImprovementAction } from "./selfImprove";

export interface OrchestrationResult {
  cycleResult: { proposed: number; applied: number; skipped: number };
  appliedCount: number;
  skippedCount: number;
}

// Cycle lock ID — serializes concurrent runContinuousImprovement() calls across
// processes.  Session-level (not xact-level) so it survives across the internal
// apply transactions that each action runs.
const CYCLE_LOCK_ID = 91424019;

// Minimum gap between cycles (per-process guard, complements the advisory lock).
const MIN_CYCLE_GAP_MS = 30_000;
let lastCycleAt = 0;

export async function runContinuousImprovement(): Promise<OrchestrationResult> {
  const now = Date.now();
  if (now - lastCycleAt < MIN_CYCLE_GAP_MS) {
    return { cycleResult: { proposed: 0, applied: 0, skipped: 0 }, appliedCount: 0, skippedCount: 0 };
  }

  // Acquire a session-level advisory lock so only one instance runs at a time
  // across all processes sharing the same Postgres connection pool.
  await db.execute(sql`SELECT pg_advisory_lock(${CYCLE_LOCK_ID})`);
  lastCycleAt = Date.now();

  const start = Date.now();
  let actionsProposed = 0;
  let actionsApplied = 0;
  let actionsRejected = 0;
  let cycleError: string | undefined;

  try {
    const proposed = await evaluateAndImprove();
    actionsProposed = proposed.length;

    for (const action of proposed) {
      if (action.status !== "proposed") {
        actionsRejected++;
        continue;
      }
      const result = await applyImprovementAction(action.id, "auto-approved");
      if (result.applied) {
        actionsApplied++;
      } else {
        actionsRejected++;
      }
    }
  } catch (err: any) {
    cycleError = err?.message ?? String(err);
    console.error("[selfImprovementOrchestrator] cycle error:", err);
  } finally {
    // Always release the session lock, even on error
    await db.execute(sql`SELECT pg_advisory_unlock(${CYCLE_LOCK_ID})`).catch(() => {});

    // Persist cycle audit record
    await db
      .insert(improvementCycleLog)
      .values({
        actionsProposed,
        actionsApplied,
        actionsRejected,
        durationMs: Date.now() - start,
        error: cycleError ?? null,
      })
      .catch((err) => console.error("[selfImprovementOrchestrator] cycle log write failed:", err));
  }

  return {
    cycleResult: { proposed: actionsProposed, applied: actionsApplied, skipped: actionsRejected },
    appliedCount: actionsApplied,
    skippedCount: actionsRejected,
  };
}
