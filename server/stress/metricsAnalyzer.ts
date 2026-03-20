import { db } from "../db";
import { engineLogs } from "../../shared/schema";
import { desc, gte } from "drizzle-orm";

export interface SystemMetrics {
  totalLogs: number;
  errorRate: number;
  avgLatencyMs: number;
  maxLatencyMs: number;
  engineBreakdown: Record<string, {
    total: number;
    errors: number;
    avgLatency: number;
    errorRate: number;
  }>;
  statusSummary: Record<string, number>;
  recentErrors: string[];
  analyzedAt: string;
}

export async function analyzeSystem(windowMinutes = 60): Promise<SystemMetrics> {
  try {
    const cutoff = new Date(Date.now() - windowMinutes * 60 * 1000);

    const logs = await db
      .select()
      .from(engineLogs)
      .where(gte(engineLogs.createdAt, cutoff))
      .orderBy(desc(engineLogs.createdAt))
      .limit(5000);

    if (logs.length === 0) {
      return {
        totalLogs: 0,
        errorRate: 0,
        avgLatencyMs: 0,
        maxLatencyMs: 0,
        engineBreakdown: {},
        statusSummary: {},
        recentErrors: [],
        analyzedAt: new Date().toISOString(),
      };
    }

    const errorCount = logs.filter(l => l.status === "error").length;
    const errorRate = errorCount / logs.length;
    const avgLatency = logs.reduce((a, l) => a + (l.latencyMs ?? 0), 0) / logs.length;
    const maxLatency = Math.max(...logs.map(l => l.latencyMs ?? 0));

    const engineBreakdown: Record<string, { total: number; errors: number; totalLatency: number }> = {};
    const statusSummary: Record<string, number> = {};
    const recentErrors: string[] = [];

    for (const log of logs) {
      if (!engineBreakdown[log.engine]) {
        engineBreakdown[log.engine] = { total: 0, errors: 0, totalLatency: 0 };
      }
      engineBreakdown[log.engine].total++;
      engineBreakdown[log.engine].totalLatency += log.latencyMs ?? 0;
      if (log.status === "error") {
        engineBreakdown[log.engine].errors++;
        if (recentErrors.length < 10 && log.message) {
          recentErrors.push(`[${log.engine}] ${log.message}`);
        }
      }
      statusSummary[log.status] = (statusSummary[log.status] || 0) + 1;
    }

    const breakdown: SystemMetrics["engineBreakdown"] = {};
    for (const [engine, stats] of Object.entries(engineBreakdown)) {
      breakdown[engine] = {
        total: stats.total,
        errors: stats.errors,
        avgLatency: Math.round(stats.totalLatency / stats.total),
        errorRate: Math.round((stats.errors / stats.total) * 1000) / 10,
      };
    }

    return {
      totalLogs: logs.length,
      errorRate: Math.round(errorRate * 1000) / 10,
      avgLatencyMs: Math.round(avgLatency),
      maxLatencyMs: maxLatency,
      engineBreakdown: breakdown,
      statusSummary,
      recentErrors,
      analyzedAt: new Date().toISOString(),
    };
  } catch (e: any) {
    console.error("[MetricsAnalyzer] Error:", e?.message);
    return {
      totalLogs: 0,
      errorRate: 0,
      avgLatencyMs: 0,
      maxLatencyMs: 0,
      engineBreakdown: {},
      statusSummary: {},
      recentErrors: [],
      analyzedAt: new Date().toISOString(),
    };
  }
}
