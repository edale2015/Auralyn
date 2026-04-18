/**
 * Validation dashboard aggregator for the Control Tower.
 *
 * Reads the last 50 validation runs from the database and surfaces
 * trend data for the frontend dashboard.
 *
 * Schema: validation_runs(id, total_cases, accuracy, sensitivity,
 *         specificity, f1, brier, notes, created_at)
 */

import { db }  from "../db";
import { sql } from "drizzle-orm";

export interface ValidationDashboardData {
  latest:      Record<string, unknown>;
  passRates:   number[];   // accuracy per run
  unsafeTrend: number[];   // 1 - sensitivity per run (proxy for unsafe undercalls)
  brierTrend:  number[];
  timestamps:  string[];
}

export async function getValidationDashboard(): Promise<ValidationDashboardData> {
  const rows = await db.execute(
    sql`SELECT id, total_cases, accuracy, sensitivity, specificity, f1, brier, notes, created_at
        FROM validation_runs
        ORDER BY created_at DESC LIMIT 50`,
  );

  const runs = rows.rows as Array<{
    id:          number;
    total_cases: number;
    accuracy:    number;
    sensitivity: number;
    specificity: number;
    f1:          number;
    brier:       number;
    notes:       string | null;
    created_at:  Date;
  }>;

  const latest = runs[0]
    ? {
        totalCases:  runs[0].total_cases,
        accuracy:    runs[0].accuracy,
        sensitivity: runs[0].sensitivity,
        specificity: runs[0].specificity,
        f1:          runs[0].f1,
        brier:       runs[0].brier,
        notes:       runs[0].notes,
        // Derived: unsafe undercall rate proxy = 1 - sensitivity
        unsafeUndercallRate: runs[0].sensitivity != null
          ? Number((1 - runs[0].sensitivity).toFixed(4))
          : null,
        passRate: runs[0].accuracy,
      }
    : {};

  return {
    latest,
    passRates:   runs.map((r) => r.accuracy   ?? 0),
    unsafeTrend: runs.map((r) => r.sensitivity != null ? 1 - r.sensitivity : 0),
    brierTrend:  runs.map((r) => r.brier      ?? 0),
    timestamps:  runs.map((r) => new Date(r.created_at).toISOString()),
  };
}

export async function logValidationRun(summary: {
  totalCases:  number;
  accuracy:    number;
  sensitivity: number;
  specificity: number;
  f1:          number;
  brier:       number;
  notes?:      string;
}): Promise<void> {
  await db.execute(sql`
    INSERT INTO validation_runs
      (total_cases, accuracy, sensitivity, specificity, f1, brier, notes)
    VALUES
      (${summary.totalCases}, ${summary.accuracy}, ${summary.sensitivity},
       ${summary.specificity}, ${summary.f1}, ${summary.brier},
       ${summary.notes ?? null})
  `);
}
