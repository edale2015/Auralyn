import { db } from "../db";
import { systemSnapshots } from "../../shared/schema";
import { desc, eq } from "drizzle-orm";

export interface SnapshotState {
  weights?: Record<string, number>;
  safety?: any;
  diagnosis?: string;
  confidence?: number;
  autonomyMode?: string;
  queueDepth?: number;
  circuitBreakers?: any[];
  billing?: any;
  traceId?: string;
  scores?: any;
}

export async function saveSnapshot(
  state: SnapshotState,
  meta?: { traceId?: string; patientId?: string; complaint?: string }
): Promise<void> {
  try {
    await db.insert(systemSnapshots).values({
      traceId: meta?.traceId ?? state.traceId ?? null,
      patientId: meta?.patientId ?? null,
      complaint: meta?.complaint ?? null,
      autonomyMode: state.autonomyMode ?? null,
      safetyLevel: state.safety?.level ?? null,
      confidence: state.confidence ?? null,
      state: state as Record<string, unknown>,
    });
  } catch (e: any) {
    console.error("[SystemSnapshot] Failed to save snapshot:", e?.message);
  }
}

export async function getRecentSnapshots(limit = 20) {
  try {
    return await db
      .select()
      .from(systemSnapshots)
      .orderBy(desc(systemSnapshots.createdAt))
      .limit(limit);
  } catch (e: any) {
    console.error("[SystemSnapshot] getRecentSnapshots error:", e?.message);
    return [];
  }
}

export async function getSnapshotByTrace(traceId: string) {
  try {
    const rows = await db
      .select()
      .from(systemSnapshots)
      .where(eq(systemSnapshots.traceId, traceId))
      .limit(1);
    return rows[0] ?? null;
  } catch (e: any) {
    console.error("[SystemSnapshot] getSnapshotByTrace error:", e?.message);
    return null;
  }
}
