import { publishers } from "../queues/publishers";
import { isBullAvailable } from "../queues/bullmq/connection";
import { logger } from "../utils/logger";
import { startBackpressuredLoop, BackpressuredLoopHandle } from "../jobs/backpressuredLoop";
import { runWithAdvisoryLock } from "../jobs/advisoryScheduler";
import { runKbConsistencyAudit } from "../kb/kbConsistencyAudit";

const _handles: BackpressuredLoopHandle[] = [];
let _started = false;

function makeLockedJob(
  name: string,
  intervalMs: number,
  task: () => Promise<void>
): BackpressuredLoopHandle {
  return startBackpressuredLoop(
    name,
    intervalMs,
    async () => {
      const { ran } = await runWithAdvisoryLock(name, task);
      if (!ran) {
        logger.info(`[Scheduler] ${name} — advisory lock held by another instance, skipping`);
      }
    },
    (ctx) => logger.warn(`[Scheduler] Job ${ctx.loop} failed`, { err: String((ctx.err as any)?.message ?? ctx.err) })
  );
}

export function startProductionScheduler(): void {
  if (_started) return;

  if (!isBullAvailable()) {
    logger.info("[Scheduler] Redis unavailable — BullMQ scheduler not started (KB consistency still runs)");
  }

  _started = true;

  if (isBullAvailable()) {
    _handles.push(
      makeLockedJob("golden-case-batch", 60 * 60 * 1000, async () => {
        await publishers.goldenCase.runBatch({});
        logger.info("[Scheduler] Scheduled job: golden-case-batch (every 3600s)");
      })
    );

    _handles.push(
      makeLockedJob("metrics-rollup", 15 * 60 * 1000, async () => {
        await publishers.metrics.rollup({});
        logger.info("[Scheduler] Scheduled job: metrics-rollup (every 900s)");
      })
    );

    _handles.push(
      makeLockedJob("executive-report", 24 * 60 * 60 * 1000, async () => {
        await publishers.report.buildExecutive({ reportType: "daily_summary" });
        logger.info("[Scheduler] Scheduled job: executive-report (every 86400s)");
      })
    );
  }

  _handles.push(
    makeLockedJob("kb-consistency-audit", 24 * 60 * 60 * 1000, async () => {
      const result = await runKbConsistencyAudit();
      logger.info(`[Scheduler] KB consistency audit complete — severity: ${result.severity}`);
    })
  );

  const jobCount = _handles.length;
  const bullJobCount = isBullAvailable() ? 3 : 0;
  logger.info(
    `[Scheduler] Production scheduler started with ${jobCount} jobs ` +
    `(${bullJobCount} BullMQ + 1 advisory-locked KB audit) — all with backpressure`
  );
}

export function stopProductionScheduler(): void {
  for (const handle of _handles) handle.stop();
  _handles.length = 0;
  _started = false;
  logger.info("[Scheduler] Production scheduler stopped");
}
