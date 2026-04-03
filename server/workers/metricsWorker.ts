import { createTrackedWorker } from "../queues/bullmq/baseWorker";
import { QUEUE_NAMES } from "../queues/bullmq/queueNames";
import { db } from "../db";
import { kbLearningEvents, goldenCaseRuns } from "@shared/schema";
import { count, desc } from "drizzle-orm";
import { logger } from "../utils/logger";

export function createMetricsWorker() {
  return createTrackedWorker(
    QUEUE_NAMES.METRICS,
    async (job) => {
      const data = job.data as any;
      const clinicId: string | undefined = data.clinicId;

      logger.info("[MetricsWorker] Rolling up metrics", { clinicId });

      const [[learningRow], recentRuns] = await Promise.all([
        db.select({ total: count() }).from(kbLearningEvents),
        db.select().from(goldenCaseRuns).orderBy(desc(goldenCaseRuns.runAt)).limit(20),
      ]);

      const passRate = recentRuns.length
        ? recentRuns.filter((r) => r.passed).length / recentRuns.length
        : null;

      const summary = {
        clinicId: clinicId ?? "all",
        learningEvents: learningRow?.total ?? 0,
        goldenCasePassRate: passRate !== null ? +(passRate * 100).toFixed(1) : null,
        recentGoldenRuns: recentRuns.length,
        rolledUpAt: new Date().toISOString(),
      };

      logger.info("[MetricsWorker] Rollup complete", summary);
      return { rolledUp: true, summary };
    },
    { concurrency: 3 }
  );
}
