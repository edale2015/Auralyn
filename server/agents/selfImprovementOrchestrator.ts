import { sql } from "drizzle-orm";
import { db }  from "../db";
import { improvementCycleLog } from "../../shared/schema";
import {
  evaluateAndImprove,
  applyImprovementAction,
  countAppliedInWindow,
  AUTO_APPROVE_PERMITTED,
  type GovernedAction,
} from "./selfImprove";
import { auditStep } from "../audit/auditLogger";

// ── Rate limit: max auto-approved changes per rolling window ─────────────────
//
// Even individually safe operational changes can destabilize the system in
// aggregate. This is a hard cap enforced independently of per-action approval.
const AUTO_APPROVE_RATE_LIMIT = {
  maxChanges:  5,
  windowHours: 24,
};

// ── Cycle lock — prevents concurrent cycles across processes ─────────────────
const CYCLE_LOCK_ID = 91424019;

// Per-process minimum gap complement: even if two calls arrive in the same
// process before the first lock acquisition, the second waits for the promise.
const MIN_CYCLE_GAP_MS = 30_000;
let lastCycleAt = 0;

// ── In-process serialisation: concurrent calls share the same cycle promise ──
let cycleInProgress: Promise<OrchestrationResult> | null = null;

// ── Result shape ─────────────────────────────────────────────────────────────
export interface OrchestrationResult {
  cycleId:       string;
  proposedCount: number;
  appliedCount:  number;
  skippedCount:  number;
  rateLimited:   number;
  applied:       { id: string; agent: string; parameter: string; toValue: number | null }[];
  skipped:       { id: string; agent: string; reason: string }[];
  timestamp:     string;
  // Backward-compat alias
  cycleResult:   { proposed: number; applied: number; skipped: number };
}

// ── Public entry point ───────────────────────────────────────────────────────
/**
 * Runs one improvement cycle.
 *
 * Serialised — if a cycle is already in progress, concurrent callers join the
 * existing promise rather than starting a second cycle.  This prevents double-
 * application of the same fix when the scheduler fires faster than cycles
 * complete.
 */
export async function runContinuousImprovement(): Promise<OrchestrationResult> {
  if (cycleInProgress) {
    console.warn("[SelfImproveOrchestrator] Cycle already in progress — joining");
    return cycleInProgress;
  }

  cycleInProgress = _runCycle().finally(() => {
    cycleInProgress = null;
  });

  return cycleInProgress;
}

// ── Internal cycle implementation ─────────────────────────────────────────────
async function _runCycle(): Promise<OrchestrationResult> {
  const now = Date.now();
  if (now - lastCycleAt < MIN_CYCLE_GAP_MS) {
    const cycleId   = crypto.randomUUID();
    const timestamp = new Date().toISOString();
    return {
      cycleId, timestamp,
      proposedCount: 0, appliedCount: 0, skippedCount: 0, rateLimited: 0,
      applied: [], skipped: [],
      cycleResult: { proposed: 0, applied: 0, skipped: 0 },
    };
  }

  // Acquire session-level advisory lock so only one process runs at a time
  await db.execute(sql`SELECT pg_advisory_lock(${CYCLE_LOCK_ID})`);
  lastCycleAt = Date.now();

  const cycleId    = crypto.randomUUID();
  const timestamp  = new Date().toISOString();
  const start      = Date.now();
  let   cycleError: string | undefined;

  // Audit the cycle start — FDA needs to know when evaluations ran
  await auditStep({
    traceId:  `selfimprove-cycle-${cycleId}`,
    step:     "improvement_cycle_started",
    input:    { cycleId },
    output:   null,
    metadata: { timestamp },
  });

  const applied:  OrchestrationResult["applied"]  = [];
  const skipped:  OrchestrationResult["skipped"]  = [];
  let rateLimited = 0;
  let autoAppliedThisCycle = 0;

  let proposedActions: GovernedAction[] = [];

  try {
    // ── Rate limit pre-check ─────────────────────────────────────────────
    const windowMs     = AUTO_APPROVE_RATE_LIMIT.windowHours * 3_600_000;
    const recentApplied = await countAppliedInWindow(windowMs);
    const remainingBudget = Math.max(0, AUTO_APPROVE_RATE_LIMIT.maxChanges - recentApplied);

    if (remainingBudget === 0) {
      console.warn(
        `[SelfImproveOrchestrator] Auto-approve rate limit reached ` +
        `(${recentApplied} changes in last ${AUTO_APPROVE_RATE_LIMIT.windowHours}h). ` +
        `No auto-approvals this cycle.`
      );
    }

    // ── Evaluate ──────────────────────────────────────────────────────────
    proposedActions = await evaluateAndImprove();

    for (const action of proposedActions) {
      const idStr = String(action.id);

      // ── Gate 1: Category policy ────────────────────────────────────────
      // Clinical and security changes are NEVER auto-approved.
      // This check is intentionally redundant with the autoApprove field —
      // defence-in-depth: two independent checks at different code layers.
      if (!AUTO_APPROVE_PERMITTED[action.category]) {
        skipped.push({
          id:     idStr,
          agent:  action.agent,
          reason: `Category "${action.category}" requires physician review — queued for pending_review`,
        });
        // Status is already `pending_review` from evaluateAndImprove()
        continue;
      }

      // ── Gate 2: autoApprove field ──────────────────────────────────────
      // Belt-and-suspenders: even if category check passed, the derived
      // field must also be true.
      if (!action.autoApprove) {
        skipped.push({
          id:     idStr,
          agent:  action.agent,
          reason: "autoApprove is false — queued for review",
        });
        continue;
      }

      // ── Gate 3: Rate limit ─────────────────────────────────────────────
      if (autoAppliedThisCycle >= remainingBudget) {
        rateLimited++;
        skipped.push({
          id:     idStr,
          agent:  action.agent,
          reason: `Rate limit: max ${AUTO_APPROVE_RATE_LIMIT.maxChanges} auto-approvals per ${AUTO_APPROVE_RATE_LIMIT.windowHours}h`,
        });
        continue;
      }

      // ── Apply with full audit trail ────────────────────────────────────
      try {
        const result = await applyImprovementAction(action.id, "auto-approved");
        if (result.applied) {
          applied.push({
            id:        idStr,
            agent:     action.agent,
            parameter: action.parameter ?? "",
            toValue:   action.toValue,
          });
          autoAppliedThisCycle++;
        } else {
          skipped.push({ id: idStr, agent: action.agent, reason: result.reason });
        }
      } catch (err) {
        console.error(`[SelfImproveOrchestrator] Failed to apply action ${idStr}:`, err);
        skipped.push({
          id:     idStr,
          agent:  action.agent,
          reason: `Application error: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }
  } catch (err: any) {
    cycleError = err?.message ?? String(err);
    console.error("[SelfImproveOrchestrator] Evaluation error:", err);

    await auditStep({
      traceId:  `selfimprove-cycle-${cycleId}`,
      step:     "improvement_cycle_evaluation_error",
      input:    { cycleId },
      output:   null,
      metadata: { error: cycleError },
    });
  } finally {
    // Always release the session lock and persist the cycle audit record
    await db.execute(sql`SELECT pg_advisory_unlock(${CYCLE_LOCK_ID})`).catch(() => {});

    await db
      .insert(improvementCycleLog)
      .values({
        actionsProposed: proposedActions.length,
        actionsApplied:  applied.length,
        actionsRejected: skipped.length,
        durationMs:      Date.now() - start,
        error:           cycleError ?? null,
      })
      .catch((err) => console.error("[SelfImproveOrchestrator] cycle log write failed:", err));
  }

  const result: OrchestrationResult = {
    cycleId,
    timestamp,
    proposedCount: proposedActions.length,
    appliedCount:  applied.length,
    skippedCount:  skipped.length,
    rateLimited,
    applied,
    skipped,
    cycleResult: {
      proposed: proposedActions.length,
      applied:  applied.length,
      skipped:  skipped.length,
    },
  };

  // Audit cycle completion — persists the governance summary for FDA review
  await auditStep({
    traceId:  `selfimprove-cycle-${cycleId}`,
    step:     "improvement_cycle_completed",
    input:    { cycleId, proposedCount: result.proposedCount },
    output:   { appliedCount: result.appliedCount, skippedCount: result.skippedCount, rateLimited },
    metadata: { applied, skipped },
  });

  return result;
}
