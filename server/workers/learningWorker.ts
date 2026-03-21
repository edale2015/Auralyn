import { Worker } from "bullmq";
import { upsertJobRecord } from "../repos/jobRepo";
import { attachWorkerEvents } from "./baseWorkerEvents";
import { logger } from "../utils/logger";
import { withEngineMetrics } from "../monitoring/engineMetrics";
import { getRedis } from "../queue/redis";

export function createLearningWorker() {
  const connection = getRedis();

  const worker = new Worker(
    "learning",
    async (job) => {
      return withEngineMetrics("learning-engine", job.data?.clinicId, async () => {
        logger.info("Learning job processing", {
          jobId: job.id,
          traceId: job.data?.traceId
        });

        await upsertJobRecord({
          id: job.id!,
          clinicId: job.data?.clinicId,
          queueName: "learning",
          jobName: job.name,
          status: "processing",
          payload: job.data
        });

        return { updated: true };
      });
    },
    { connection }
  );

  attachWorkerEvents(worker, "learning");
  return worker;
}
