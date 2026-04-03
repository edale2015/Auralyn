import { createTrackedWorker } from "../queues/bullmq/baseWorker";
import { QUEUE_NAMES } from "../queues/bullmq/queueNames";
import { db } from "../db";
import { kbGoldenCases, goldenCaseRuns } from "@shared/schema";
import { eq, desc, count } from "drizzle-orm";
import { logger } from "../utils/logger";

export function createReportWorker() {
  return createTrackedWorker(
    QUEUE_NAMES.REPORT,
    async (job) => {
      const data = job.data as any;
      const reportType: string = data.reportType ?? "daily_summary";
      const clinicId: string | undefined = data.clinicId;

      logger.info("[ReportWorker] Building report", { reportType, clinicId });

      const [[activeRow], recentRuns] = await Promise.all([
        db.select({ total: count() }).from(kbGoldenCases).where(eq(kbGoldenCases.active, true)),
        db.select().from(goldenCaseRuns).orderBy(desc(goldenCaseRuns.runAt)).limit(10),
      ]);

      const passRate = recentRuns.length
        ? recentRuns.filter((r) => r.passed).length / recentRuns.length
        : null;

      const report = {
        reportType,
        clinicId: clinicId ?? "all",
        generatedAt: new Date().toISOString(),
        activeGoldenCases: activeRow?.total ?? 0,
        goldenCasePassRate: passRate !== null ? `${(passRate * 100).toFixed(1)}%` : "no data",
        recentRunCount: recentRuns.length,
      };

      logger.info("[ReportWorker] Report built", report);
      return { built: true, report };
    },
    { concurrency: 2 }
  );
}
