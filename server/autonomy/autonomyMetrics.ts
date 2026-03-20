import { db } from "../db";
import { autonomyMetrics } from "../../shared/schema";

export interface AutonomyMetricInput {
  traceId?: string;
  complaint?: string;
  mode: string;
  dispositionGiven?: string;
  confidence?: number;
  wasOverridden?: boolean;
  safetyTriggered?: boolean;
  guardrailsTriggered?: string[];
}

export async function logAutonomyMetric(input: AutonomyMetricInput): Promise<void> {
  try {
    await db.insert(autonomyMetrics).values({
      traceId: input.traceId,
      complaint: input.complaint,
      mode: input.mode,
      dispositionGiven: input.dispositionGiven,
      confidence: input.confidence,
      wasOverridden: input.wasOverridden ?? false,
      safetyTriggered: input.safetyTriggered ?? false,
      guardrailsTriggered: input.guardrailsTriggered ?? [],
    });
  } catch (e: any) {
    console.warn("[AutonomyMetrics] Failed to log metric:", e?.message);
  }
}

export async function getAutonomyStats(limitDays = 7): Promise<{
  total: number;
  overrideRate: number;
  safetyTriggerRate: number;
  avgConfidence: number;
  byMode: Record<string, number>;
}> {
  try {
    const { sql } = await import("drizzle-orm");
    const rows = await db
      .select()
      .from(autonomyMetrics)
      .orderBy(sql`created_at DESC`)
      .limit(1000);

    if (!rows.length) return { total: 0, overrideRate: 0, safetyTriggerRate: 0, avgConfidence: 0, byMode: {} };

    const total = rows.length;
    const overridden = rows.filter((r) => r.wasOverridden).length;
    const safetyHits = rows.filter((r) => r.safetyTriggered).length;
    const confidences = rows.map((r) => r.confidence ?? 0).filter((c) => c > 0);
    const avgConfidence = confidences.length > 0 ? confidences.reduce((a, b) => a + b, 0) / confidences.length : 0;

    const byMode: Record<string, number> = {};
    for (const r of rows) {
      byMode[r.mode] = (byMode[r.mode] ?? 0) + 1;
    }

    return {
      total,
      overrideRate: Number((overridden / total).toFixed(4)),
      safetyTriggerRate: Number((safetyHits / total).toFixed(4)),
      avgConfidence: Number(avgConfidence.toFixed(4)),
      byMode,
    };
  } catch (e: any) {
    console.warn("[AutonomyMetrics] getAutonomyStats error:", e?.message);
    return { total: 0, overrideRate: 0, safetyTriggerRate: 0, avgConfidence: 0, byMode: {} };
  }
}
