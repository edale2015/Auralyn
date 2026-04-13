/**
 * server/governance/governanceQueue.ts
 *
 * FIX (Batch-1 Finding #1 — Critical): Governance approval state now persisted
 * to governance_items DB table. In-memory array is a read cache only.
 * Every write goes to DB first; the in-memory list is refreshed from DB.
 *
 * Previously: module-level array — reset on every restart, non-compliant with
 * HIPAA and FDA 21 CFR Part 11.
 */

import { db }              from "../db";
import { governanceItems } from "../../shared/schema";
import { eq, desc, and }   from "drizzle-orm";

export type GovernanceStatus = "pending" | "approved" | "rejected";

export interface GovernanceItem {
  id:         string;
  sheet:      string;
  change:     any;
  status:     GovernanceStatus;
  risk:       string;
  reason?:    string;
  reviewedBy?: string;
  reviewedAt?: number;
  timestamp:  number;
}

// ── In-memory cache (read optimisation only — never source of truth) ──────────

let _cache: GovernanceItem[] = [];

function rowToItem(row: typeof governanceItems.$inferSelect): GovernanceItem {
  return {
    id:         row.id,
    sheet:      row.sheet,
    change:     row.change,
    status:     row.status as GovernanceStatus,
    risk:       row.risk,
    reason:     row.reason ?? undefined,
    reviewedBy: row.reviewedBy ?? undefined,
    reviewedAt: row.reviewedAt ? new Date(row.reviewedAt).getTime() : undefined,
    timestamp:  new Date(row.createdAt).getTime(),
  };
}

// ── Writes — always go to DB first ───────────────────────────────────────────

export async function addGovernanceItem(
  item: Omit<GovernanceItem, "status" | "timestamp"> & Partial<GovernanceItem>
): Promise<void> {
  const now = new Date();
  await db.insert(governanceItems).values({
    id:     item.id,
    sheet:  item.sheet,
    change: item.change ?? {},
    status: "pending",
    risk:   item.risk,
    reason: item.reason,
  });
  _cache.unshift({ status: "pending", timestamp: now.getTime(), ...item } as GovernanceItem);
}

export async function updateGovernanceStatus(
  id:         string,
  status:     GovernanceStatus,
  reviewedBy?: string
): Promise<boolean> {
  const result = await db
    .update(governanceItems)
    .set({ status, reviewedBy, reviewedAt: new Date() })
    .where(eq(governanceItems.id, id));

  // Refresh cache entry
  const cached = _cache.find((i) => i.id === id);
  if (cached) {
    cached.status     = status;
    cached.reviewedBy = reviewedBy;
    cached.reviewedAt = Date.now();
  }

  return (result.rowCount ?? 0) > 0;
}

// ── Reads — pull from DB, refresh cache ──────────────────────────────────────

export async function listGovernanceQueue(
  filter?: { status?: GovernanceStatus; sheet?: string }
): Promise<GovernanceItem[]> {
  const rows = await db
    .select()
    .from(governanceItems)
    .orderBy(desc(governanceItems.createdAt));

  _cache = rows.map(rowToItem);

  let items = _cache;
  if (filter?.status) items = items.filter((i) => i.status === filter.status);
  if (filter?.sheet)  items = items.filter((i) => i.sheet  === filter.sheet);
  return items;
}

export async function getGovernanceItem(id: string): Promise<GovernanceItem | undefined> {
  const cached = _cache.find((i) => i.id === id);
  if (cached) return cached;

  const rows = await db
    .select()
    .from(governanceItems)
    .where(eq(governanceItems.id, id));
  return rows.length > 0 ? rowToItem(rows[0]) : undefined;
}

export async function getGovernanceStats(): Promise<{
  total: number; pending: number; approved: number; rejected: number;
  byRisk: Record<string, number>; bySheet: Record<string, number>;
}> {
  const rows = await db.select().from(governanceItems);
  const byStatus: Record<string, number> = {};
  const byRisk:   Record<string, number> = {};
  const bySheet:  Record<string, number> = {};

  rows.forEach((row) => {
    byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
    byRisk[row.risk]     = (byRisk[row.risk]     ?? 0) + 1;
    bySheet[row.sheet]   = (bySheet[row.sheet]   ?? 0) + 1;
  });

  return {
    total:    rows.length,
    pending:  byStatus.pending  ?? 0,
    approved: byStatus.approved ?? 0,
    rejected: byStatus.rejected ?? 0,
    byRisk,
    bySheet,
  };
}

/** Sync stats from cache — safe for non-critical read paths only */
export function getGovernanceStatsCached(): ReturnType<typeof getGovernanceStats> extends Promise<infer T> ? T : never {
  const byStatus: Record<string, number> = {};
  const byRisk:   Record<string, number> = {};
  const bySheet:  Record<string, number> = {};
  _cache.forEach((i) => {
    byStatus[i.status] = (byStatus[i.status] ?? 0) + 1;
    byRisk[i.risk]     = (byRisk[i.risk]     ?? 0) + 1;
    bySheet[i.sheet]   = (bySheet[i.sheet]   ?? 0) + 1;
  });
  return {
    total:    _cache.length,
    pending:  byStatus.pending  ?? 0,
    approved: byStatus.approved ?? 0,
    rejected: byStatus.rejected ?? 0,
    byRisk,
    bySheet,
  };
}
