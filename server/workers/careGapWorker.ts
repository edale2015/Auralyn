import { Worker } from "bullmq";
import { attachWorkerEvents } from "./baseWorkerEvents";
import { logger } from "../utils/logger";
import { withEngineMetrics } from "../monitoring/engineMetrics";
import { getRedis } from "../queue/redis";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { CareIntelligenceEngine } from "../inpatient/CareIntelligenceEngine";

export function createCareGapWorker() {
  const connection = getRedis();
  if (!connection) {
    logger.warn("[CareGapWorker] Redis unavailable — care gap worker not started");
    return null;
  }

  const engine = new CareIntelligenceEngine();

  const worker = new Worker(
    "care-gap-detection",
    async (job) => {
      return withEngineMetrics("care-gap-detection", job.data?.clinicId, async () => {
        logger.info("[CareGapWorker] Starting gap scan", { jobId: job.id, jobName: job.name });

        const rows = await db.execute(sql`
          SELECT encounter_id, patient_id
          FROM encounters
          WHERE status = 'inpatient' AND discharged_at IS NULL
        `).then(r => r.rows as Array<{ encounter_id: string; patient_id: string }>).catch(() => []);

        if (rows.length === 0) {
          logger.info("[CareGapWorker] No active inpatient encounters to scan");
          return { scanned: 0, errors: 0 };
        }

        let scanned = 0;
        let errors  = 0;

        for (const enc of rows) {
          try {
            const chart = await engine.loadChart(enc.encounter_id);
            await engine.detectGaps(chart);
            await engine.escalateOverdueGaps();
            scanned++;
          } catch (err: any) {
            errors++;
            logger.error(`[CareGapWorker] Failed for encounter ${enc.encounter_id}`, {
              error: err?.message ?? String(err),
            });
          }
        }

        logger.info("[CareGapWorker] Scan complete", { scanned, errors, total: rows.length });
        return { scanned, errors };
      });
    },
    { connection, concurrency: 3 }
  );

  attachWorkerEvents(worker, "care-gap-detection");
  logger.info("[CareGapWorker] Worker registered (queue: care-gap-detection, concurrency: 3)");
  return worker;
}
