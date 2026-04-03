import { publishers } from "../queues/publishers";
import { isBullAvailable } from "../queues/bullmq/connection";
import { logger } from "../utils/logger";

interface ScheduledJob {
  name: string;
  intervalMs: number;
  handler: () => Promise<void>;
}

const _timers: NodeJS.Timeout[] = [];
let _started = false;

const SCHEDULED_JOBS: ScheduledJob[] = [
  {
    name: "golden-case-batch",
    intervalMs: 60 * 60 * 1000, // every hour
    handler: async () => {
      await publishers.goldenCase.runBatch({});
      logger.info("[Scheduler] Golden case batch enqueued");
    },
  },
  {
    name: "metrics-rollup",
    intervalMs: 15 * 60 * 1000, // every 15 minutes
    handler: async () => {
      await publishers.metrics.rollup({});
      logger.info("[Scheduler] Metrics rollup enqueued");
    },
  },
  {
    name: "executive-report",
    intervalMs: 24 * 60 * 60 * 1000, // every 24 hours
    handler: async () => {
      await publishers.report.buildExecutive({ reportType: "daily_summary" });
      logger.info("[Scheduler] Executive report enqueued");
    },
  },
];

export function startProductionScheduler(): void {
  if (_started) return;

  if (!isBullAvailable()) {
    logger.info("[Scheduler] Redis unavailable — scheduler not started");
    return;
  }

  _started = true;

  for (const job of SCHEDULED_JOBS) {
    const timer = setInterval(async () => {
      try {
        await job.handler();
      } catch (e: any) {
        logger.warn(`[Scheduler] Job ${job.name} failed`, { message: e?.message });
      }
    }, job.intervalMs);

    _timers.push(timer);
    logger.info(`[Scheduler] Scheduled job: ${job.name} (every ${job.intervalMs / 1000}s)`);
  }

  logger.info(`[Scheduler] Production scheduler started with ${SCHEDULED_JOBS.length} jobs`);
}

export function stopProductionScheduler(): void {
  for (const t of _timers) clearInterval(t);
  _timers.length = 0;
  _started = false;
  logger.info("[Scheduler] Production scheduler stopped");
}
