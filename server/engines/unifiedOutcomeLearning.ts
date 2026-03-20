import { db } from "../db";
import { outcomes, weights, modelVersions } from "../../shared/schema";
import { desc, eq } from "drizzle-orm";

export async function recordOutcome({
  input,
  predicted,
  actual,
}: {
  input: Record<string, any>;
  predicted: string;
  actual: string | null;
}): Promise<void> {
  try {
    await db.insert(outcomes).values({ input, predicted, actual: actual ?? "pending" });
  } catch (e) {
    console.error("[UnifiedOutcomeLearning] recordOutcome error:", e);
  }
}

let learningCycleCount = 0;

export async function runLearningCycle(): Promise<{ processed: number; updated: string[] }> {
  try {
    const recent = await db
      .select()
      .from(outcomes)
      .orderBy(desc(outcomes.createdAt))
      .limit(200);

    const updated: string[] = [];

    for (const o of recent) {
      if (!o.predicted) continue;
      const delta = o.predicted === o.actual ? 0.02 : -0.05;
      const diagnosis = o.predicted;

      const existing = await db.select().from(weights).where(eq(weights.diagnosis, diagnosis));
      if (existing.length > 0) {
        const newValue = Math.max(0.1, Math.min(2.0, (existing[0].value ?? 1.0) + delta));
        await db.update(weights).set({ value: newValue }).where(eq(weights.diagnosis, diagnosis));
      } else {
        await db.insert(weights).values({ diagnosis, value: Math.max(0.1, 1.0 + delta) });
      }
      if (!updated.includes(diagnosis)) updated.push(diagnosis);
    }

    learningCycleCount++;

    if (updated.length > 0) {
      const allWeights = await db.select().from(weights);
      const snapshot: Record<string, number> = {};
      for (const w of allWeights) {
        snapshot[w.diagnosis] = w.value ?? 1.0;
      }

      await db.insert(modelVersions).values({
        weights: snapshot,
        cycleCount: learningCycleCount,
        triggeredBy: "autonomous_loop",
      }).catch((e: any) => {
        console.error("[UnifiedOutcomeLearning] Failed to save model version:", e?.message);
      });
    }

    console.log(`[UnifiedOutcomeLearning] Cycle #${learningCycleCount} complete — processed ${recent.length}, updated weights: ${updated.join(", ") || "none"}`);
    return { processed: recent.length, updated };
  } catch (e) {
    console.error("[UnifiedOutcomeLearning] runLearningCycle error:", e);
    return { processed: 0, updated: [] };
  }
}

export async function getWeight(diagnosis: string): Promise<number> {
  try {
    const row = await db.select().from(weights).where(eq(weights.diagnosis, diagnosis));
    return row[0]?.value ?? 1.0;
  } catch {
    return 1.0;
  }
}

export async function getAllWeights(): Promise<Array<{ diagnosis: string; value: number }>> {
  try {
    const rows = await db.select().from(weights).orderBy(desc(weights.value));
    return rows.map(r => ({ diagnosis: r.diagnosis, value: r.value ?? 1.0 }));
  } catch (e) {
    console.error("[UnifiedOutcomeLearning] getAllWeights error:", e);
    return [];
  }
}

export async function getRecentOutcomes(limit = 50) {
  try {
    return await db.select().from(outcomes).orderBy(desc(outcomes.createdAt)).limit(limit);
  } catch (e) {
    console.error("[UnifiedOutcomeLearning] getRecentOutcomes error:", e);
    return [];
  }
}

export async function getModelVersions(limit = 20) {
  try {
    return await db.select().from(modelVersions).orderBy(desc(modelVersions.createdAt)).limit(limit);
  } catch (e) {
    console.error("[UnifiedOutcomeLearning] getModelVersions error:", e);
    return [];
  }
}

export function getLearningCycleCount(): number {
  return learningCycleCount;
}
