/**
 * Validation dashboard aggregator for the Control Tower.
 *
 * Reads the last 50 validation runs from the database and surfaces
 * trend data for the frontend dashboard.
 */

import { db } from "../db/client";
import { sql } from "drizzle-orm";

export interface ValidationDashboardData {
  latest:     Record<string, unknown>;
  passRates:  number[];
  unsafeTrend: number[];
  timestamps: string[];
}

export async function getValidationDashboard(): Promise<ValidationDashboardData> {
  const rows = await db.execute(
    sql`SELECT id, summary, created_at FROM validation_runs ORDER BY created_at DESC LIMIT 50`,
  );

  const runs = rows.rows as Array<{ id: string; summary: unknown; created_at: Date }>;

  const summaries = runs.map((r) => (r.summary as Record<string, unknown>) ?? {});
  const latest    = summaries[0] ?? {};

  return {
    latest,
    passRates:   summaries.map((s) => (s.passRate  as number) ?? 0),
    unsafeTrend: summaries.map((s) => (s.unsafeUndercalls as number) ?? 0),
    timestamps:  runs.map((r) => new Date(r.created_at).toISOString()),
  };
}

export async function logValidationRun(summary: Record<string, unknown>): Promise<void> {
  const id = `val_${Date.now()}`;

  await db.execute(
    sql`INSERT INTO validation_runs (id, summary) VALUES (${id}, ${JSON.stringify(summary)})`,
  );
}
