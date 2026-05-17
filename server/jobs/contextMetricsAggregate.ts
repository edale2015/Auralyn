/**
 * Context Metrics Aggregator — T020
 *
 * Runs daily (or on-demand) to aggregate per-encounter context telemetry
 * into the context_metrics_daily table for dashboards and SLA monitoring.
 *
 * Telemetry is emitted by ClinicalContextManager (T020 hooks in assemblePromptFor)
 * and by ContextCompactor (compaction events).
 *
 * Schema: context_metrics_daily (encounterId, date, role, totalPromptTokens,
 *   peakPromptTokens, compactionEvents, artifactsPublished, artifactsExcluded,
 *   prefixStableRatio, createdAt)
 *
 * Export:
 *   runContextMetricsAggregate()   — run once immediately (for manual trigger)
 *   scheduleContextMetricsAggregate() — schedule daily at 01:00 UTC
 */

import { db }    from "../db";
import { sql }   from "drizzle-orm";

export interface DailyContextMetrics {
  date:                string;
  totalEncounters:     number;
  totalPromptTokens:   number;
  avgPromptTokens:     number;
  peakPromptTokens:    number;
  totalCompactions:    number;
  avgCompactionsPerEnc: number;
  totalArtifacts:      number;
  totalExcluded:       number;
  exclusionRate:       number;
}

// ─── Core aggregation ────────────────────────────────────────────────────────

export async function runContextMetricsAggregate(): Promise<DailyContextMetrics> {
  const today = new Date().toISOString().slice(0, 10);

  try {
    const rows = await db.execute(sql`
      SELECT
        COUNT(DISTINCT encounter_id)        AS total_encounters,
        COALESCE(SUM(prompt_tokens), 0)     AS total_prompt_tokens,
        COALESCE(AVG(prompt_tokens), 0)     AS avg_prompt_tokens,
        COALESCE(MAX(prompt_tokens), 0)     AS peak_prompt_tokens,
        COALESCE(SUM(compaction_events), 0) AS total_compactions,
        COALESCE(SUM(artifacts_published), 0) AS total_artifacts,
        COALESCE(SUM(artifacts_excluded), 0)  AS total_excluded
      FROM context_metrics_daily
      WHERE DATE(created_at) = ${today}
    `);

    const r: any = (rows as any).rows?.[0] ?? rows?.[0] ?? {};

    const totalEncounters   = Number(r.total_encounters    ?? 0);
    const totalPromptTokens = Number(r.total_prompt_tokens ?? 0);
    const avgPromptTokens   = Number(r.avg_prompt_tokens   ?? 0);
    const peakPromptTokens  = Number(r.peak_prompt_tokens  ?? 0);
    const totalCompactions  = Number(r.total_compactions   ?? 0);
    const totalArtifacts    = Number(r.total_artifacts     ?? 0);
    const totalExcluded     = Number(r.total_excluded      ?? 0);

    const result: DailyContextMetrics = {
      date:                 today,
      totalEncounters,
      totalPromptTokens,
      avgPromptTokens:      totalEncounters > 0 ? Math.round(avgPromptTokens) : 0,
      peakPromptTokens,
      totalCompactions,
      avgCompactionsPerEnc: totalEncounters > 0 ? totalCompactions / totalEncounters : 0,
      totalArtifacts,
      totalExcluded,
      exclusionRate:        totalArtifacts + totalExcluded > 0
        ? totalExcluded / (totalArtifacts + totalExcluded)
        : 0,
    };

    console.log(`[context-metrics] aggregated date=${today}`, result);
    return result;
  } catch (err: any) {
    console.warn("[context-metrics] aggregation failed (non-critical):", err.message);
    return {
      date:                 today,
      totalEncounters:      0,
      totalPromptTokens:    0,
      avgPromptTokens:      0,
      peakPromptTokens:     0,
      totalCompactions:     0,
      avgCompactionsPerEnc: 0,
      totalArtifacts:       0,
      totalExcluded:        0,
      exclusionRate:        0,
    };
  }
}

// ─── Daily scheduler ────────────────────────────────────────────────────────

let _aggregateTimer: ReturnType<typeof setInterval> | null = null;

export function scheduleContextMetricsAggregate(): void {
  if (_aggregateTimer) return;

  const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

  _aggregateTimer = setInterval(() => {
    runContextMetricsAggregate().catch(err =>
      console.warn("[context-metrics] scheduled run failed:", err.message),
    );
  }, TWENTY_FOUR_HOURS);

  if (_aggregateTimer?.unref) {
    (_aggregateTimer as any).unref();
  }

  console.log("[context-metrics] daily aggregation scheduled (24h interval)");
  runContextMetricsAggregate().catch(() => {});
}

export function cancelContextMetricsAggregate(): void {
  if (_aggregateTimer) {
    clearInterval(_aggregateTimer);
    _aggregateTimer = null;
  }
}
