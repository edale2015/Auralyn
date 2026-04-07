import { eq, and, inArray, desc } from "drizzle-orm";
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

// Per-action advisory lock base.  We xor the action id so each row gets a
// unique lock slot without hard-coding values.
const ACTION_LOCK_BASE = 91424030;

// ── Legacy compat type (used by payerIntelligenceRoutes / metaOrchestrator) ──
export interface ImprovementAction {
  agent: string;
  action: string;
  reason: string;
  timestamp: string;
  metric: { successRate: number; runs: number };
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
export async function evaluateAndImprove(): Promise<DbImprovementAction[]> {
  const stats = getAgentStats();
  const created: DbImprovementAction[] = [];

  for (const [agent, s] of Object.entries(stats)) {
    if (s.runs < 5) continue;

    try {
      validateAgentStat(s);
    } catch {
      continue;
    }

    const metric = { successRate: s.successRate, runs: s.runs };

    if (s.successRate < 60) {
      const parameter = "conservatism";
      if (await hasOpenProposal(agent, parameter)) continue;

      const currentRow = await db
        .select({ currentValue: agentThresholdRecords.currentValue })
        .from(agentThresholdRecords)
        .where(and(eq(agentThresholdRecords.agent, agent), eq(agentThresholdRecords.parameter, parameter)))
        .limit(1);
      const fromValue = currentRow[0]?.currentValue ?? 0;
      const toValue = Math.min(1, fromValue + 0.1);

      const [row] = await db
        .insert(improvementActions)
        .values({
          agent,
          action: "threshold_adjustment",
          parameter,
          fromValue,
          toValue,
          reason: `Success rate ${s.successRate}% below 60% over ${s.runs} runs`,
          status: "proposed",
          metric,
        } satisfies InsertImprovementAction)
        .returning();

      created.push(row);
      publish("selfimprove:adjustment", { agent, actionId: row.id });
    }

    if (s.successRate < 40) {
      const parameter = "escalation";
      if (await hasOpenProposal(agent, parameter)) continue;

      const [row] = await db
        .insert(improvementActions)
        .values({
          agent,
          action: "escalation_recommended",
          parameter,
          fromValue: null,
          toValue: null,
          reason: `Critical: ${agent} rate ${s.successRate}% — physician-only fallback recommended`,
          status: "pending_review",
          metric,
        } satisfies InsertImprovementAction)
        .returning();

      created.push(row);
      publish("selfimprove:escalation", { agent, actionId: row.id });
    }

    if (s.avgMs > 5000) {
      const parameter = "latency_alert";
      if (await hasOpenProposal(agent, parameter)) continue;

      const [row] = await db
        .insert(improvementActions)
        .values({
          agent,
          action: "performance_warning",
          parameter,
          fromValue: null,
          toValue: null,
          reason: `Agent ${agent} avg latency ${s.avgMs}ms exceeds 5 s`,
          status: "proposed",
          metric,
        } satisfies InsertImprovementAction)
        .returning();

      created.push(row);
    }
  }

  // Keep legacy in-memory log slice for backward-compat callers
  _appendLegacyLog(created);
  return created;
}

// ── Apply an approved action (idempotent, compare-and-swap) ──────────────────
export async function applyImprovementAction(
  actionId: number,
  decidedBy: string
): Promise<{ applied: boolean; reason: string }> {
  return db.transaction(async (tx) => {
    // Per-action advisory lock — serializes concurrent apply calls for the same row
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

    // Compare-and-swap: verify the threshold hasn't drifted since proposal
    if (action.fromValue !== null && action.toValue !== null && action.parameter) {
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
          .set({ status: "failed", errorMessage: `CAS mismatch: expected ${action.fromValue}, found ${dbVal}`, decidedAt: new Date(), decidedBy })
          .where(eq(improvementActions.id, actionId));
        return { applied: false, reason: "compare-and-swap mismatch — stale proposal" };
      }

      // Write the new threshold
      await tx
        .insert(agentThresholdRecords)
        .values({ agent: action.agent, parameter: action.parameter, currentValue: action.toValue, updatedBy: decidedBy })
        .onConflictDoUpdate({
          target: [agentThresholdRecords.agent, agentThresholdRecords.parameter],
          set: { currentValue: action.toValue, updatedAt: new Date(), updatedBy: decidedBy },
        });
    }

    // Mark applied
    const now = new Date();
    await tx
      .update(improvementActions)
      .set({ status: "applied", decidedAt: now, decidedBy })
      .where(eq(improvementActions.id, actionId));

    await auditStep({
      traceId: `selfimprove-apply-${actionId}`,
      step: "apply_improvement_action",
      input: { actionId, decidedBy },
      output: { agent: action.agent, parameter: action.parameter, toValue: action.toValue },
      metadata: { actionId, agent: action.agent },
    });

    return { applied: true, reason: "ok" };
  });
}

// ── Reject an action ─────────────────────────────────────────────────────────
export async function rejectImprovementAction(
  actionId: number,
  reviewerId: string,
  note?: string
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
      note: note ?? null,
    });
  });
}

// ── Approve + apply by a physician reviewer ───────────────────────────────────
export async function approveAndApplyAction(
  actionId: number,
  reviewerId: string,
  note?: string
): Promise<{ applied: boolean; reason: string }> {
  await db
    .update(improvementActions)
    .set({ status: "approved", decidedAt: new Date(), decidedBy: reviewerId })
    .where(eq(improvementActions.id, actionId));

  await db.insert(improvementReviews).values({
    actionId,
    reviewerId,
    decision: "approved",
    note: note ?? null,
  });

  return applyImprovementAction(actionId, reviewerId);
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

// ── computeBusinessMetrics (unchanged — used by metaOrchestrator) ─────────────
export function computeBusinessMetrics(claimData: Array<{ revenue: number; paid: boolean }>): {
  revenue: number;
  cost: number;
  profit: number;
  margin: number;
  strategy: string;
} {
  const revenue = claimData.reduce((sum, c) => sum + (c.paid ? c.revenue : 0), 0);
  const cost = claimData.length * 0.02;
  const profit = revenue - cost;
  const margin = revenue > 0 ? Math.round(((revenue - cost) / revenue) * 100) / 100 : 0;

  let strategy: string;
  if (margin < 0.5) strategy = "Reduce compute cost or renegotiate payer contracts — margin critically low";
  else if (margin < 0.7) strategy = "Optimize coding accuracy to reduce denials and improve revenue per claim";
  else if (revenue > 50000) strategy = "Scale marketing and clinic partnerships — strong unit economics";
  else strategy = "Focus on growth — add clinics, expand payer network, increase case volume";

  return { revenue: Math.round(revenue), cost: Math.round(cost * 100) / 100, profit: Math.round(profit * 100) / 100, margin, strategy };
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
      agent: r.agent,
      action: r.action,
      reason: r.reason,
      timestamp: r.proposedAt?.toISOString() ?? new Date().toISOString(),
      metric: (r.metric as { successRate: number; runs: number }) ?? { successRate: 0, runs: 0 },
    });
  }
  if (_legacyLog.length > 500) _legacyLog.splice(0, _legacyLog.length - 500);
}
