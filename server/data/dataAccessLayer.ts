/**
 * Centralised data access layer — single source of truth for
 * outcome and revenue metrics derived from the live DB.
 *
 * All dashboard panels should call these helpers instead of
 * writing inline DB queries, so there is exactly one place to
 * maintain the aggregation logic.
 */
import { db } from "../db";
import { sql } from "drizzle-orm";

export interface OutcomeStats {
  avgOutcome: number;    // 0-1 (normalised from ai_confidence 0-100)
  escalationRate: number;// fraction of encounters marked urgent/emergent
  totalEncounters: number;
}

export interface RevenueStats {
  denialRate: number;    // fraction of claims with status='denied'
  avgPaid: number;       // average claim amount (dollars)
  totalClaims: number;
}

export interface SystemSnapshot {
  outcomes: OutcomeStats;
  revenue: RevenueStats;
  health: "GREEN" | "YELLOW" | "RED";
  timestamp: string;
}

/**
 * Derive outcome metrics from the live `encounters` table.
 * Falls back to safe defaults if the table is empty or unavailable.
 */
export async function getOutcomeStats(): Promise<OutcomeStats> {
  try {
    const rows = await db.execute(sql`
      SELECT
        COUNT(*)::int                                              AS total,
        COALESCE(AVG(ai_confidence), 0)                          AS avg_conf,
        COALESCE(
          SUM(CASE WHEN urgency_level IN ('urgent','emergent') THEN 1 ELSE 0 END)::float
          / NULLIF(COUNT(*), 0),
          0
        )                                                         AS escalation_rate
      FROM encounters
    `);

    const row = (rows.rows ?? rows)[0] as any;
    const total = parseInt(row?.total ?? "0", 10);

    return {
      avgOutcome:     Math.min(1, Math.max(0, parseFloat(row?.avg_conf ?? "0") / 100)),
      escalationRate: parseFloat(row?.escalation_rate ?? "0"),
      totalEncounters: total,
    };
  } catch {
    return { avgOutcome: 0, escalationRate: 0, totalEncounters: 0 };
  }
}

/**
 * Derive revenue metrics from the live `claims` table.
 * Falls back to safe defaults if the table is empty or unavailable.
 */
export async function getRevenueStats(): Promise<RevenueStats> {
  try {
    const rows = await db.execute(sql`
      SELECT
        COUNT(*)::int                                             AS total,
        COALESCE(
          SUM(CASE WHEN status = 'denied' THEN 1 ELSE 0 END)::float
          / NULLIF(COUNT(*), 0),
          0
        )                                                         AS denial_rate,
        COALESCE(AVG(amount), 0)                                 AS avg_paid
      FROM claims
    `);

    const row = (rows.rows ?? rows)[0] as any;

    return {
      denialRate:  parseFloat(row?.denial_rate ?? "0"),
      avgPaid:     parseFloat(row?.avg_paid    ?? "0"),
      totalClaims: parseInt(row?.total         ?? "0", 10),
    };
  } catch {
    return { denialRate: 0, avgPaid: 0, totalClaims: 0 };
  }
}

/**
 * Combined system snapshot used by the War Room and monitoring panels.
 * Health is GREEN when outcomes are strong and denials are low.
 */
export async function getSystemSnapshot(): Promise<SystemSnapshot> {
  const [outcomes, revenue] = await Promise.all([getOutcomeStats(), getRevenueStats()]);

  const health: "GREEN" | "YELLOW" | "RED" =
    outcomes.avgOutcome > 0.7 && revenue.denialRate < 0.2
      ? "GREEN"
      : outcomes.avgOutcome > 0.5 && revenue.denialRate < 0.35
      ? "YELLOW"
      : "RED";

  return { outcomes, revenue, health, timestamp: new Date().toISOString() };
}
