import { db } from "../db";
import { engineLogs } from "../../shared/schema";
import { desc } from "drizzle-orm";

export interface FailurePrediction {
  errorRate: number;
  topFailingEngines: Array<{ engine: string; errorCount: number; rate: number }>;
  unstable: boolean;
  recommendation: string;
}

export async function predictFailures(): Promise<FailurePrediction> {
  try {
    const logs = await db
      .select()
      .from(engineLogs)
      .orderBy(desc(engineLogs.createdAt))
      .limit(100);

    if (logs.length === 0) {
      return { errorRate: 0, topFailingEngines: [], unstable: false, recommendation: "No data yet." };
    }

    const errorCount = logs.filter(l => l.status === "error").length;
    const errorRate = errorCount / logs.length;

    const engineErrors: Record<string, { total: number; errors: number }> = {};
    for (const log of logs) {
      if (!engineErrors[log.engine]) engineErrors[log.engine] = { total: 0, errors: 0 };
      engineErrors[log.engine].total++;
      if (log.status === "error") engineErrors[log.engine].errors++;
    }

    const topFailingEngines = Object.entries(engineErrors)
      .map(([engine, s]) => ({ engine, errorCount: s.errors, rate: Math.round((s.errors / s.total) * 100) / 100 }))
      .filter(e => e.errorCount > 0)
      .sort((a, b) => b.errorCount - a.errorCount)
      .slice(0, 5);

    const unstable = errorRate > 0.1;
    if (unstable) {
      console.warn(`[PredictiveEngine] System instability detected: ${Math.round(errorRate * 100)}% error rate`);
    }

    return {
      errorRate: Math.round(errorRate * 1000) / 1000,
      topFailingEngines,
      unstable,
      recommendation: unstable
        ? `Instability detected (${Math.round(errorRate * 100)}% errors). Review: ${topFailingEngines.map(e => e.engine).join(", ")}`
        : "System operating within normal parameters."
    };
  } catch (e) {
    console.error("[PredictiveEngine] Error:", e);
    return { errorRate: 0, topFailingEngines: [], unstable: false, recommendation: "Prediction unavailable." };
  }
}
