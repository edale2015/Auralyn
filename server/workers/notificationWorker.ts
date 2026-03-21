import { Worker } from "bullmq";
import { upsertJobRecord } from "../repos/jobRepo";
import { attachWorkerEvents } from "./baseWorkerEvents";
import { logger } from "../utils/logger";
import { withEngineMetrics } from "../monitoring/engineMetrics";
import { getRedis } from "../queue/redis";

export function createNotificationWorker() {
  const connection = getRedis();

  const worker = new Worker(
    "notification",
    async (job) => {
      return withEngineMetrics("notification-engine", job.data?.clinicId, async () => {
        logger.info("Notification job processing", {
          jobId: job.id,
          traceId: job.data?.traceId
        });

        await upsertJobRecord({
          id: job.id!,
          clinicId: job.data?.clinicId,
          queueName: "notification",
          jobName: job.name,
          status: "processing",
          payload: job.data
        });

        return { sent: true };
      });
    },
    { connection }
  );

  attachWorkerEvents(worker, "notification");
  return worker;
}
