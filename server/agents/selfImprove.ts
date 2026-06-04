import { eq, and, inArray, desc, gte, count } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { db } from "../db";
import {
  agentThresholdRecords,
  improvementActions,
  improvementReviews,
  type ImprovementAction as DbImprovementAction,
  type InsertImprovementAction,
} from "../../shared/schema";
import { getAgentStats } from "./tracking";
import { publish } from "./eventBus";
import { auditStep } from "../audit/auditLogger";

// ── Lifecycle constants ──────────────────────────────────────────────────────
export const ACTION_STATUSES = ["proposed", "pending_review", "approved", "applied", "rejected", "failed"] as const;
export type ActionStatus = typeof ACTION_STATUSES[number];

// Per-action advisory lock base.  We XOR the action id so each row gets a
// unique lock slot without hard-coding values.
const ACTION_LOCK_BASE = 91424030;

// ── Category firewall ────────────────────────────────────────────────────────
/**
 * ChangeCategory governs whether a parameter adjustment is auto-approvable.
 *
 * clinical  — touches patient safety pathways (never auto-approve)
 * security  — touches auth / audit controls (never auto-approve)
 * performance — touches latency / accuracy knobs (never auto-approve — needs review)
 * operational — retry limits, timeouts, alerting (may auto-approve per AUTO_APPROVE_PERMITTED)
 */
export type ChangeCategory = "clinical" | "security" | "performance" | "operational";

export const AUTO_APPROVE_PERMITTED: Record<ChangeCategory, boolean> = {
  operational:  true,
  performance:  false,
  clinical:     false,
  security:     false,
};

interface ThresholdBounds {
  min:      number;
  max:      number;
  step:     number;
  category: ChangeCategory;
}

/**
 * Per-parameter bounds and category classification.
 *
 * - `max` is a hard ceiling: proposals that would exceed it are silently skipped.
 * - `step` is the increment applied each evaluation cycle.
 * - `category` determines auto-approve eligibility via AUTO_APPROVE_PERMITTED.
 *
 * Add new parameters here — never compute bounds at runtime from untrusted inputs.
 */
export const THRESHOLD_BOUNDS: Record<string, ThresholdBounds> = {
  conservatism:   { min: 0.0,  max: 0.9,    step: 0.1,    category: "performance" },
  retryLimit:     { min: 1,    max: 5,       step: 1,      category: "operational" },
  timeoutMs:      { min: 1000, max: 30_000,  step: 1_000,  category: "operational" },
  riskThreshold:  { min: 0.3,  max: 0.9,    step: 0.05,   category: "clinical"    },
};

// ── GovernedAction: DB row extended with runtime governance metadata ──────────
export interface GovernedAction extends DbImprovementAction {
  category:    ChangeCategory;
  autoApprove: boolean;
}

// ── Legacy compat type (used by payerIntelligenceRoutes / metaOrchestrator) ──
export interface ImprovementAction {
  agent:     string;
  action:    string;
  reason:    string;
  timestamp: string;
  metric:    { successRate: number; runs: number };
}

// ── In-memory threshold cache ────────────────────────────────────────────────
// Bounded at MAX_AGENT_THRESHOLD_ENTRIES to prevent unbounded growth if new
// agents are dynamically registered.  The DB is always the source of truth;
// this cache is an optimisation and is refreshed on upsert.
const MAX_AGENT_THRESHOLD_ENTRIES = 100;
const _thresholdMap = new Map<string, Map<string, number>>();

/**
 * Seeds the in-memory threshold cache from DB at startup.
 * Must be awaited before the first evaluateAndImprove() call if you want
 * cache hits on the first cycle.
 */
export async function seedThresholdsFromDb(): Promise<void> {
  const rows = await db.select().from(agentThresholdRecords);
  for (const row of rows) {
    if (_thresholdMap.size >= MAX_AGENT_THRESHOLD_ENTRIES) {
      console.warn("[SelfImprove] threshold cache at capacity — skipping remaining rows");
      break;
    }
    if (!_thresholdMap.has(row.agent)) _thresholdMap.set(row.agent, new Map());
    _thresholdMap.get(row.agent)!.set(row.parameter, row.currentValue);
  }
}

function _getCachedThreshold(agent: string, parameter: string): number | undefined {
  return _thresholdMap.get(agent)?.get(parameter);
}

async function _getThresholdFromDb(agent: string, parameter: string): Promise<number> {
  const rows = await db
    .select({ currentValue: agentThresholdRecords.currentValue })
    .from(agentThresholdRecords)
    .where(and(eq(agentThresholdRecords.agent, agent), eq(agentThresholdRecords.parameter, parameter)))
    .limit(1);
  return rows[0]?.currentValue ?? 0;
}

async function _persistThreshold(
  agent:     string,
  parameter: string,
  value:     number,
  updatedBy: string,
  tx?: Parameters<Parameters<typeof db.transaction>[0]>[0]
): Promise<void> {
  const orm = tx ?? db;
  await (orm as typeof db)
    .insert(agentThresholdRecords)
    .values({ agent, parameter, currentValue: value, updatedBy })
    .onConflictDoUpdate({
      target: [agentThresholdRecords.agent, agentThresholdRecords.parameter],
      set:    { currentValue: value, updatedAt: new Date(), updatedBy },
    });

  if (!_thresholdMap.has(agent)) {
    if (_thresholdMap.size >= MAX_AGENT_THRESHOLD_ENTRIES) return;
    _thresholdMap.set(agent, new Map());
  }
  _thresholdMap.get(agent)!.set(parameter, value);
}

// ── Input validation ─────────────────────────────────────────────────────────
export function validateAgentStat(stat: { runs: number; successRate: number }): void {
  if (!Number.isFinite(stat.runs) || stat.runs < 1) {
    throw new Error(`Invalid runs value: ${stat.runs}`);
  }
  if (!Number.isFinite(stat.successRate) || stat.successRate < 0 || stat.successRate > 100) {
    throw new Error(`Invalid successRate: ${stat.successRate}`);
  }
}

// ── Duplicate-proposal suppression ──────────────────────────────────────────
export async function hasOpenProposal(agent: string, parameter: string): Promise<boolean> {
  const OPEN_STATUSES: ActionStatus[] = ["proposed", "pending_review", "approved"];
  const rows = await db
    .select({ id: improvementActions.id })
    .from(improvementActions)
    .where(
      and(
        eq(improvementActions.agent, agent),
        eq(improvementActions.parameter, parameter),
        inArray(improvementActions.status, OPEN_STATUSES)
      )
    )
    .limit(1);
  return rows.length > 0;
}

// ── Core evaluation ──────────────────────────────────────────────────────────
/**
 * Evaluates all agent stats and proposes threshold adjustments where needed.
 *
 * Returns GovernedAction[] — each row is a DB-persisted ImprovementAction
 * extended with the derived `category` and `autoApprove` fields.
 *
 * Rules:
 *   - Minimum 5 runs before any proposal.
 *   - Proposals are suppressed when the parameter is already at its ceiling.
 *   - Duplicate proposals (open row for same agent+parameter) are skipped.
 *   - Only `operational` parameters can be auto-approved; all others go to
 *     `pending_review` status and require physician sign-off.
 */
export async function evaluateAndImprove(): Promise<GovernedAction[]> {
  const stats = getAgentStats();
  const created: GovernedAction[] = [];

  for (const [agent, s] of Object.entries(stats)) {
    if (s.runs < 5) continue;

    try {
      validateAgentStat(s);
    } catch {
      continue;
    }

    const metric = { successRate: s.successRate, runs: s.runs };

    // ── conservatism: raised when success rate is low ─────────────────────
    if (s.successRate < 60) {
      const parameter = "conservatism";
      const bounds    = THRESHOLD_BOUNDS[parameter];

      const cached  = _getCachedThreshold(agent, parameter);
      const current = cached !== undefined ? cached : await _getThresholdFromDb(agent, parameter);

      // Ceiling enforcement — never propose beyond max
      if (current >= bounds.max) {
        console.warn(`[SelfImprove] ${agent}.${parameter} at ceiling (${bounds.max}) — skipping proposal`);
        continue;
      }

      if (await hasOpenProposal(agent, parameter)) continue;

      const toValue     = Math.min(Math.round((current + bounds.step) * 1000) / 1000, bounds.max);
      const autoApprove = AUTO_APPROVE_PERMITTED[bounds.category];
      const status      = autoApprove ? "proposed" : "pending_review";

      const [row] = await db
        .insert(improvementActions)
        .values({
          agent,
          action:    "threshold_adjustment",
          parameter,
          fromValue: current,
          toValue,
          reason:    `Success rate ${s.successRate}% below 60% over ${s.runs} runs`,
          status,
          metric,
        } satisfies InsertImprovementAction)
        .returning();

      created.push({ ...row, category: bounds.category, autoApprove });
      publish("selfimprove:adjustment_proposed", {
        agent, parameter, fromValue: current, toValue, autoApprove, category: bounds.category,
      });
    }

    // ── escalation: critical failure rate — always clinical/pending_review ─
    if (s.successRate < 40) {
      const parameter = "escalation";
      if (await hasOpenProposal(agent, parameter)) continue;

      const [row] = await db
        .insert(improvementActions)
        .values({
          agent,
          action:    "escalation_recommended",
          parameter,
          fromValue: null,
          toValue:   null,
          reason:    `Critical: ${agent} rate ${s.successRate}% — physician-only fallback recommended`,
          status:    "pending_review",
          metric,
        } satisfies InsertImprovementAction)
        .returning();

      created.push({ ...row, category: "clinical", autoApprove: false });
      publish("selfimprove:escalation", { agent, actionId: row.id });
    }

    // ── latency_alert: high average response time — operational ───────────
    if (s.avgMs > 5000) {
      const parameter = "latency_alert";
      if (await hasOpenProposal(agent, parameter)) continue;

      const [row] = await db
        .insert(improvementActions)
        .values({
          agent,
          action:    "performance_warning",
          parameter,
          fromValue: null,
          toValue:   null,
          reason:    `Agent ${agent} avg latency ${s.avgMs}ms exceeds 5 s`,
          status:    "proposed",
          metric,
        } satisfies InsertImprovementAction)
        .returning();

      created.push({ ...row, category: "operational", autoApprove: true });
    }
  }

  _appendLegacyLog(created);
  return created;
}

// ── Apply an approved action (idempotent, bounds-validated, compare-and-swap) ─
/**
 * Applies a previously proposed or approved ImprovementAction.
 *
 * Guards (fail-closed):
 *   1. Advisory per-action lock (prevents concurrent double-apply).
 *   2. Idempotency check (already applied → no-op).
 *   3. Status guard (only `proposed` or `approved` may be applied).
 *   4. Bounds re-validation (toValue must be within THRESHOLD_BOUNDS at apply time).
 *   5. Compare-and-swap (current DB value must match fromValue from proposal).
 */
export async function applyImprovementAction(
  actionId:  number,
  decidedBy: string
): Promise<{ applied: boolean; reason: string }> {
  return db.transaction((tx) => _applyActionOnTx(tx, actionId, decidedBy));
}

/**
 * Core apply logic, executed on a caller-provided transaction.
 *
 * Runs on whatever transaction (and pooled connection) the caller already holds.
 * Callers that already have an open transaction — e.g. approveAndApplyAction —
 * MUST call this directly rather than applyImprovementAction(): opening a second
 * db.transaction would take a different pooled connection and deadlock on the
 * per-action advisory lock acquired below (pg_advisory_xact_lock is re-entrant
 * within one session, not across pooled connections).
 */
async function _applyActionOnTx(
  tx:        Parameters<Parameters<typeof db.transaction>[0]>[0],
  actionId:  number,
  decidedBy: string
): Promise<{ applied: boolean; reason: string }> {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${ACTION_LOCK_BASE + actionId})`);

    const [action] = await tx
      .select()
      .from(improvementActions)
      .where(eq(improvementActions.id, actionId))
      .limit(1);

    if (!action) return { applied: false, reason: "action not found" };
    if (action.status === "applied") return { applied: false, reason: "already applied" };
    if (!["approved", "proposed"].includes(action.status)) {
      return { applied: false, reason: `status '${action.status}' is not applicable` };
    }

    if (action.fromValue !== null && action.toValue !== null && action.parameter) {
      // ── Bounds re-validation ────────────────────────────────────────────
      const bounds = THRESHOLD_BOUNDS[action.parameter];
      if (bounds) {
        if (action.toValue < bounds.min || action.toValue > bounds.max) {
          await tx
            .update(improvementActions)
            .set({
              status:       "failed",
              errorMessage: `Out-of-bounds: ${action.parameter}=${action.toValue} (limits: ${bounds.min}–${bounds.max})`,
              decidedAt:    new Date(),
              decidedBy,
            })
            .where(eq(improvementActions.id, actionId));
          return { applied: false, reason: "value out of bounds — refused to apply" };
        }
      }

      // ── Compare-and-swap ────────────────────────────────────────────────
      const [current] = await tx
        .select({ currentValue: agentThresholdRecords.currentValue })
        .from(agentThresholdRecords)
        .where(
          and(
            eq(agentThresholdRecords.agent, action.agent),
            eq(agentThresholdRecords.parameter, action.parameter)
          )
        )
        .limit(1);

      const dbVal = current?.currentValue ?? 0;
      if (Math.abs(dbVal - (action.fromValue ?? 0)) > 1e-9) {
        await tx
          .update(improvementActions)
          .set({
            status:       "failed",
            errorMessage: `CAS mismatch: expected ${action.fromValue}, found ${dbVal}`,
            decidedAt:    new Date(),
            decidedBy,
          })
          .where(eq(improvementActions.id, actionId));
        return { applied: false, reason: "compare-and-swap mismatch — stale proposal" };
      }

      // ── Write threshold ─────────────────────────────────────────────────
      await _persistThreshold(action.agent, action.parameter, action.toValue, decidedBy, tx as any);
    }

    const now = new Date();
    await tx
      .update(improvementActions)
      .set({ status: "applied", decidedAt: now, decidedBy })
      .where(eq(improvementActions.id, actionId));

    await auditStep({
      traceId:  `selfimprove-apply-${actionId}`,
      step:     "improvement_action_applied",
      input:    { actionId, decidedBy },
      output:   { agent: action.agent, parameter: action.parameter, toValue: action.toValue },
      metadata: {
        actionId,
        agent:    action.agent,
        category: action.parameter ? (THRESHOLD_BOUNDS[action.parameter]?.category ?? "unknown") : "unknown",
        decidedBy,
      },
    });

    publish("selfimprove:adjustment_applied", {
      agent:     action.agent,
      parameter: action.parameter,
      fromValue: action.fromValue,
      toValue:   action.toValue,
      appliedBy: decidedBy,
    });

    return { applied: true, reason: "ok" };
}

// ── Reject an action ─────────────────────────────────────────────────────────
export async function rejectImprovementAction(
  actionId:   number,
  reviewerId: string,
  note?:      string
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(improvementActions)
      .set({ status: "rejected", decidedAt: new Date(), decidedBy: reviewerId })
      .where(eq(improvementActions.id, actionId));

    await tx.insert(improvementReviews).values({
      actionId,
      reviewerId,
      decision: "rejected",
      note:     note ?? null,
    });
  });
}

// ── Approve + apply by a physician reviewer ───────────────────────────────────
/**
 * Atomically approve + apply an improvement action.
 *
 * FIX (TOCTOU race — Code Review Finding #3):
 * The previous implementation issued two separate DB operations (UPDATE + apply)
 * outside of a single transaction.  Between the UPDATE that set status="approved"
 * and the subsequent applyImprovementAction() call, the row was visible in the
 * "approved" state to any concurrent caller, allowing double-application of the
 * same threshold change.
 *
 * Fix: both the approval record write AND the application happen inside one
 * transaction that acquires the per-action advisory lock first.  A concurrent
 * caller hitting applyImprovementAction() for the same actionId will block
 * on the advisory lock until this transaction commits, then see status="applied"
 * and return { applied: false, reason: "already applied" }.
 */
export async function approveAndApplyAction(
  actionId:   number,
  reviewerId: string,
  note?:      string
): Promise<{ applied: boolean; reason: string }> {
  return db.transaction(async (tx) => {
    // Acquire advisory lock inside the transaction — held until tx commits/rolls back.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${ACTION_LOCK_BASE + actionId})`);

    // Guard: re-read status under lock to detect concurrent application
    const [current] = await tx
      .select({ status: improvementActions.status })
      .from(improvementActions)
      .where(eq(improvementActions.id, actionId))
      .limit(1);

    if (!current) return { applied: false, reason: "action not found" };
    if (current.status === "applied") return { applied: false, reason: "already applied" };
    if (!["proposed", "pending_review"].includes(current.status)) {
      return { applied: false, reason: `status '${current.status}' cannot be approved` };
    }

    await tx
      .update(improvementActions)
      .set({ status: "approved", decidedAt: new Date(), decidedBy: reviewerId })
      .where(eq(improvementActions.id, actionId));

    await tx.insert(improvementReviews).values({
      actionId,
      reviewerId,
      decision: "approved",
      note:     note ?? null,
    });

    // Run the apply logic on THIS transaction (same connection / session) so it
    // re-uses the advisory lock we already hold. Calling applyImprovementAction()
    // here would open a second db.transaction on a different pooled connection and
    // deadlock on the same pg_advisory_xact_lock.
    return _applyActionOnTx(tx, actionId, reviewerId);
  });
}

// ── DB-backed log / threshold accessors ─────────────────────────────────────
export async function getImprovementLog(limit = 100): Promise<DbImprovementAction[]> {
  return db
    .select()
    .from(improvementActions)
    .orderBy(desc(improvementActions.proposedAt))
    .limit(limit);
}

export async function getAgentThresholds(): Promise<Record<string, Record<string, number>>> {
  const rows = await db.select().from(agentThresholdRecords);
  const out: Record<string, Record<string, number>> = {};
  for (const r of rows) {
    if (!out[r.agent]) out[r.agent] = {};
    out[r.agent][r.parameter] = r.currentValue;
  }
  return out;
}

export async function listPendingReviews(): Promise<DbImprovementAction[]> {
  return db
    .select()
    .from(improvementActions)
    .where(inArray(improvementActions.status, ["proposed", "pending_review", "approved"]))
    .orderBy(desc(improvementActions.proposedAt));
}

export async function getReviewHistory(actionId: number) {
  return db
    .select()
    .from(improvementReviews)
    .where(eq(improvementReviews.actionId, actionId))
    .orderBy(desc(improvementReviews.decidedAt));
}

// ── Count auto-approved actions in a rolling window (rate limit helper) ───────
export async function countAppliedInWindow(windowMs: number): Promise<number> {
  const windowStart = new Date(Date.now() - windowMs);
  const [{ value }] = await db
    .select({ value: count() })
    .from(improvementActions)
    .where(
      and(
        eq(improvementActions.status, "applied"),
        gte(improvementActions.decidedAt, windowStart)
      )
    );
  return value ?? 0;
}

// ── computeBusinessMetrics (unchanged — used by metaOrchestrator) ─────────────
export function computeBusinessMetrics(claimData: Array<{ revenue: number; paid: boolean }>): {
  revenue:  number;
  cost:     number;
  profit:   number;
  margin:   number;
  strategy: string;
} {
  const revenue = claimData.reduce((sum, c) => sum + (c.paid ? c.revenue : 0), 0);
  const cost    = claimData.length * 0.02;
  const profit  = revenue - cost;
  const margin  = revenue > 0 ? Math.round(((revenue - cost) / revenue) * 100) / 100 : 0;

  let strategy: string;
  if (margin < 0.5)         strategy = "Reduce compute cost or renegotiate payer contracts — margin critically low";
  else if (margin < 0.7)    strategy = "Optimize coding accuracy to reduce denials and improve revenue per claim";
  else if (revenue > 50000) strategy = "Scale marketing and clinic partnerships — strong unit economics";
  else                      strategy = "Focus on growth — add clinics, expand payer network, increase case volume";

  return {
    revenue:  Math.round(revenue),
    cost:     Math.round(cost * 100) / 100,
    profit:   Math.round(profit * 100) / 100,
    margin,
    strategy,
  };
}

// ── Loop management ──────────────────────────────────────────────────────────
let improvementInterval: ReturnType<typeof setInterval> | null = null;

export function startSelfImproveLoop(intervalMs = 60000) {
  if (improvementInterval) return;
  improvementInterval = setInterval(() => {
    evaluateAndImprove().catch((err) =>
      console.error("[selfImprove] loop error:", err)
    );
  }, intervalMs);
}

export function stopSelfImproveLoop() {
  if (improvementInterval) {
    clearInterval(improvementInterval);
    improvementInterval = null;
  }
}

// ── Legacy in-memory log shim (keeps backward compat for sync callers) ───────
const _legacyLog: ImprovementAction[] = [];

function _appendLegacyLog(rows: DbImprovementAction[]): void {
  for (const r of rows) {
    _legacyLog.push({
      agent:     r.agent,
      action:    r.action,
      reason:    r.reason,
      timestamp: r.proposedAt?.toISOString() ?? new Date().toISOString(),
      metric:    (r.metric as { successRate: number; runs: number }) ?? { successRate: 0, runs: 0 },
    });
  }
  if (_legacyLog.length > 500) _legacyLog.splice(0, _legacyLog.length - 500);
}
