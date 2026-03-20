import { getDb } from "../db/dbRouter";
import { fdaExperiments } from "@shared/schema";
import type { FDAMetrics } from "./metricsEngine";

export interface ExperimentConfig {
  dataset: string;
  threshold: number;
  engineVersion?: string;
  runBy?: string;
  tags?: string[];
}

export interface ExperimentRecord {
  id: number;
  config: ExperimentConfig;
  metrics: FDAMetrics;
  pass: boolean;
  createdAt: Date;
}

export async function saveExperiment(
  config: ExperimentConfig,
  metrics: FDAMetrics
): Promise<ExperimentRecord | null> {
  try {
    const db = getDb("write");
    const [row] = await db
      .insert(fdaExperiments)
      .values({
        config: config as any,
        metrics: metrics as any,
        pass: metrics.passesThreshold,
      })
      .returning();

    return row as ExperimentRecord;
  } catch (e: any) {
    console.error("[ExperimentManager] Failed to save experiment:", e?.message);
    return null;
  }
}

export async function listExperiments(limit = 20): Promise<ExperimentRecord[]> {
  try {
    const db = getDb("read");
    const rows = await db
      .select()
      .from(fdaExperiments)
      .orderBy(fdaExperiments.createdAt)
      .limit(limit);
    return rows as ExperimentRecord[];
  } catch (e: any) {
    console.error("[ExperimentManager] Failed to list experiments:", e?.message);
    return [];
  }
}
