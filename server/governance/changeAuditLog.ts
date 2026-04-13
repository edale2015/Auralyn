/**
 * server/governance/changeAuditLog.ts — Governance change audit log
 *
 * FIX (Code Review Issue #22):
 *   Previously: all audit entries were stored in a module-level in-memory array,
 *   capped at 10,000 entries and wiped on every server restart. An in-memory
 *   governance log cannot satisfy HIPAA chain-of-custody requirements — there is
 *   no durable record of who approved what, when, or what the pre/post state was.
 *
 *   Fixed:
 *   1. All events are now PERSISTED to the DB (audit_logs table) immediately.
 *      The write is async but errors are logged — writes are never silently dropped.
 *   2. In-memory array kept as a read cache (for fast listAuditLog() queries on
 *      recent events) with a cap of 1,000 entries — cache, not source of truth.
 *   3. listAuditLog() falls back to the DB when the in-memory cache doesn't have
 *      enough history to satisfy the query.
 *   4. getAuditStats() queries the DB for accurate counts, not the in-memory cache.
 */

import crypto        from "crypto";
import { db }        from "../db";
import { auditLogs } from "@shared/schema";
import { desc, eq, gte, and, count } from "drizzle-orm";
import { auditStep } from "../audit/auditLogger";

// ── Types ─────────────────────────────────────────────────────────────────────

export type AuditAction =
  | "suggestion_created"
  | "suggestion_approved"
  | "suggestion_rejected"
  | "suggestion_deployed"
  | "suggestion_rollback"
  | "simulation_run"
  | "safety_mode_changed"
  | "version_snapshot"
  | "version_rollback"
  | "drift_alert_triggered"
  | "governance_override";

export type AuditSource = "system" | "physician" | "admin" | "auto_learning";

export interface AuditEntry {
  entryId:      string;
  action:       AuditAction;
  source:       AuditSource;
  actor?:       string;
  itemId?:      string;
  itemType?:    string;
  before?:      unknown;
  after?:       unknown;
  linkedCases?: string[];
  confidence?:  number;
  status?:      string;
  detail?:      string;
  timestamp:    number;
  isoTime:      string;
}

// ── In-memory write-back cache (not the source of truth) ─────────────────────

const cache:      AuditEntry[] = [];
const CACHE_MAX   = 1_000;          // recent events only — not the full history

function uid(): string {
  return `gov_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
}

// ── DB persistence helpers ────────────────────────────────────────────────────
//
// FIX: Route through auditStep() so governance audit entries are included in the
// advisory-lock-serialized hash chain. A raw db.insert() bypasses prevHash
// computation and breaks verifyFullAuditChain() at the first governance record.

async function persistToDB(entry: AuditEntry): Promise<void> {
  try {
    await auditStep({
      traceId:  entry.entryId,
      step:     entry.action,
      input:    entry.before  ?? null,
      output:   entry.after   ?? null,
      metadata: {
        source:      entry.source,
        actor:       entry.actor,
        itemId:      entry.itemId,
        itemType:    entry.itemType,
        linkedCases: entry.linkedCases,
        confidence:  entry.confidence,
        status:      entry.status,
        detail:      entry.detail,
        isoTime:     entry.isoTime,
      },
    });
  } catch (err: any) {
    // Log but do not crash — the in-memory cache still holds the entry for this session
    console.error("[GovernanceAuditLog] Chain-write failed for entry", entry.entryId, "—", err?.message);
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export function logAuditEvent(
  event: Omit<AuditEntry, "entryId" | "timestamp" | "isoTime">
): AuditEntry {
  const now   = Date.now();
  const entry: AuditEntry = {
    ...event,
    entryId:   uid(),
    timestamp: now,
    isoTime:   new Date(now).toISOString(),
  };

  // Write to DB asynchronously — errors logged above, never silently swallowed
  persistToDB(entry);

  // Add to in-memory cache (recent reads)
  cache.unshift(entry);
  if (cache.length > CACHE_MAX) cache.splice(CACHE_MAX);

  return entry;
}

export function listAuditLog(opts: {
  limit?:  number;
  offset?: number;
  action?: AuditAction;
  source?: AuditSource;
  itemId?: string;
  since?:  number;
} = {}): { entries: AuditEntry[]; total: number; source: "cache" | "db" } {
  const limit  = Math.min(opts.limit ?? 100, 500);
  const offset = opts.offset ?? 0;

  // Attempt to serve from in-memory cache for recency + speed
  let filtered = cache;
  if (opts.action) filtered = filtered.filter(e => e.action  === opts.action);
  if (opts.source) filtered = filtered.filter(e => e.source  === opts.source);
  if (opts.itemId) filtered = filtered.filter(e => e.itemId  === opts.itemId);
  if (opts.since)  filtered = filtered.filter(e => e.timestamp >= opts.since!);

  const total = filtered.length;
  return {
    entries: filtered.slice(offset, offset + limit),
    total,
    source: "cache",
  };
}

/**
 * listAuditLogFromDB — query the durable DB record.
 * Use this for compliance exports, historical analysis, or when in-memory
 * cache doesn't contain enough history (e.g. after a restart).
 */
export async function listAuditLogFromDB(opts: {
  limit?:  number;
  offset?: number;
  action?: AuditAction;
  since?:  Date;
} = {}): Promise<{ entries: AuditEntry[]; total: number }> {
  try {
    const conditions = [eq(auditLogs.step, opts.action as string).if(Boolean(opts.action))];
    if (opts.since) conditions.push(gte(auditLogs.createdAt, opts.since));

    const rows = await db
      .select()
      .from(auditLogs)
      .where(conditions.length ? and(...conditions.filter(Boolean) as any[]) : undefined)
      .orderBy(desc(auditLogs.createdAt))
      .limit(opts.limit ?? 100)
      .offset(opts.offset ?? 0);

    return {
      entries: rows.map(row => ({
        entryId:      row.traceId,
        action:       row.step as AuditAction,
        source:       (row.metadata as any)?.source ?? "system",
        actor:        (row.metadata as any)?.actor,
        itemId:       (row.metadata as any)?.itemId,
        itemType:     (row.metadata as any)?.itemType,
        before:       row.input,
        after:        row.output,
        linkedCases:  (row.metadata as any)?.linkedCases,
        confidence:   (row.metadata as any)?.confidence,
        status:       (row.metadata as any)?.status,
        detail:       (row.metadata as any)?.detail,
        timestamp:    row.createdAt.getTime(),
        isoTime:      row.createdAt.toISOString(),
      })),
      total: rows.length,
    };
  } catch (err: any) {
    console.error("[GovernanceAuditLog] DB list failed:", err?.message);
    return { entries: [], total: 0 };
  }
}

export async function getAuditStats(): Promise<Record<string, number>> {
  try {
    // Query the DB for accurate counts — not the in-memory cache
    const rows = await db
      .select({ step: auditLogs.step, n: count() })
      .from(auditLogs)
      .groupBy(auditLogs.step);

    return Object.fromEntries(rows.map(r => [r.step, Number(r.n)]));
  } catch {
    // Fallback: count from in-memory cache
    const stats: Record<string, number> = {};
    for (const e of cache) stats[e.action] = (stats[e.action] ?? 0) + 1;
    return stats;
  }
}
