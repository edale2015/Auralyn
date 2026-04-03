import { Worker, type Job, type WorkerOptions } from "bullmq";
import { getBullConnection, isBullAvailable } from "./connection";
import { trackJobQueued, trackJobStatus } from "./jobTracker";
import { upsertJobRecord } from "../../repos/jobRepo";
import { logger } from "../../utils/logger";

export type JobHandler<T = any, R = any> = (job: Job<T>) => Promise<R>;

export function createTrackedWorker<T = any, R = any>(
  queueName: string,
  handler: JobHandler<T, R>,
  opts?: Partial<WorkerOptions>
): Worker<T, R> | null {
  if (!isBullAvailable()) {
    logger.info(`[BaseWorker] Redis unavailable — ${queueName} worker not started`);
    return null;
  }

  const connection = getBullConnection();
  if (!connection) return null;

  const worker = new Worker<T, R>(
    queueName,
    async (job: Job<T>) => {
      await trackJobStatus(queueName, job.id!, "processing");

      try {
        const result = await handler(job);

        await Promise.all([
          trackJobStatus(queueName, job.id!, "completed", result as any),
          upsertJobRecord({
            id: job.id!,
            clinicId: (job.data as any)?.clinicId,
            queueName,
            jobName: job.name,
            status: "completed",
            payload: job.data as any,
          }).catch(() => {}),
        ]);

        return result;
      } catch (err: any) {
        await Promise.all([
          trackJobStatus(queueName, job.id!, "failed", undefined, err?.message, job.attemptsMade),
          upsertJobRecord({
            id: job.id!,
            clinicId: (job.data as any)?.clinicId,
            queueName,
            jobName: job.name,
            status: "failed",
            payload: job.data as any,
          }).catch(() => {}),
        ]);
        throw err;
      }
    },
    {
      connection,
      concurrency: 5,
      ...opts,
    }
  );

  worker.on("completed", (job) =>
    logger.info(`[${queueName}] Job completed`, { jobId: job.id })
  );
  worker.on("failed", (job, err) =>
    logger.warn(`[${queueName}] Job failed`, { jobId: job?.id, message: err?.message })
  );
  worker.on("error", (err) =>
    logger.warn(`[${queueName}] Worker error`, { message: err?.message })
  );

  return worker;
}
