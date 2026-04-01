/**
 * Version snapshot store — saves and retrieves snapshots of system
 * state so that any change can be rolled back to a prior version.
 *
 * Backed by the `system_snapshots` Postgres table so state survives
 * restarts and is visible to the audit trail (no file-system drift).
 */
import { db } from "../db";
import { sql } from "drizzle-orm";

export interface Snapshot {
  id: number;
  label: string;
  timestamp: string;
  data: Record<string, unknown>;
}

/** Persist a new snapshot. Returns the snapshot id. */
export async function saveSnapshot(label: string, obj: Record<string, unknown>): Promise<number> {
  try {
    const result = await db.execute(sql`
      INSERT INTO governance_snapshots (label, payload, created_at)
      VALUES (${label}, ${JSON.stringify(obj)}::jsonb, NOW())
      RETURNING id
    `);
    const row = (result.rows ?? result)[0] as any;
    return parseInt(row?.id ?? "0", 10);
  } catch (e) {
    console.error("[versionStore] saveSnapshot failed:", e);
    return 0;
  }
}

/** Return the N most recent snapshots (newest first). */
export async function listSnapshots(limit = 20): Promise<Snapshot[]> {
  try {
    const result = await db.execute(sql`
      SELECT id, label, payload, created_at
      FROM governance_snapshots
      ORDER BY created_at DESC
      LIMIT ${limit}
    `);
    const rows = (result.rows ?? result) as any[];
    return rows.map(r => ({
      id:        r.id,
      label:     r.label ?? "",
      timestamp: r.created_at ?? "",
      data:      typeof r.payload === "string" ? JSON.parse(r.payload) : (r.payload ?? {}),
    }));
  } catch {
    return [];
  }
}

/** Return the most recent snapshot before the current one (i.e. the rollback target). */
export async function rollbackLast(): Promise<Record<string, unknown> | null> {
  const snapshots = await listSnapshots(2);
  if (snapshots.length < 2) return null;
  return snapshots[1].data;
}

/** Return snapshot by id. */
export async function getSnapshot(id: number): Promise<Snapshot | null> {
  try {
    const result = await db.execute(sql`
      SELECT id, label, payload, created_at
      FROM governance_snapshots WHERE id = ${id}
    `);
    const row = (result.rows ?? result)[0] as any;
    if (!row) return null;
    return {
      id:        row.id,
      label:     row.label ?? "",
      timestamp: row.created_at ?? "",
      data:      typeof row.payload === "string" ? JSON.parse(row.payload) : (row.payload ?? {}),
    };
  } catch {
    return null;
  }
}
