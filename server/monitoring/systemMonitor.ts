import { db } from "../db";
import { engineLogs } from "../../shared/schema";
import { desc, eq, sql } from "drizzle-orm";

export async function logEngineStatus(
  engine: string,
  status: "healthy" | "error" | "warning",
  latencyMs: number,
  error: string | null = null
) {
  try {
    await db.insert(engineLogs).values({ engine, status, latencyMs, error });
  } catch (e) {
    console.error("[SystemMonitor] Failed to log engine status:", e);
  }
}

export async function getSystemHealth(): Promise<Record<string, { healthy: number; error: number; warning: number; avgLatencyMs: number }>> {
  try {
    const logs = await db
      .select()
      .from(engineLogs)
      .orderBy(desc(engineLogs.createdAt))
      .limit(200);

    const summary: Record<string, { healthy: number; error: number; warning: number; latencies: number[] }> = {};

    for (const log of logs) {
      if (!summary[log.engine]) {
        summary[log.engine] = { healthy: 0, error: 0, warning: 0, latencies: [] };
      }
      if (log.status === "healthy") summary[log.engine].healthy++;
      else if (log.status === "error") summary[log.engine].error++;
      else summary[log.engine].warning++;
      if (log.latencyMs) summary[log.engine].latencies.push(log.latencyMs);
    }

    return Object.fromEntries(
      Object.entries(summary).map(([engine, s]) => [
        engine,
        {
          healthy: s.healthy,
          error: s.error,
          warning: s.warning,
          avgLatencyMs: s.latencies.length > 0
            ? Math.round(s.latencies.reduce((a, b) => a + b, 0) / s.latencies.length)
            : 0,
        },
      ])
    );
  } catch (e) {
    console.error("[SystemMonitor] getSystemHealth error:", e);
    return {};
  }
}

export async function getRecentEngineLogs(limit = 50) {
  try {
    return await db.select().from(engineLogs).orderBy(desc(engineLogs.createdAt)).limit(limit);
  } catch (e) {
    console.error("[SystemMonitor] getRecentEngineLogs error:", e);
    return [];
  }
}
