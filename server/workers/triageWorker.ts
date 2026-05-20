import { Worker } from "bullmq";
import { upsertJobRecord } from "../repos/jobRepo";
import { attachWorkerEvents } from "./baseWorkerEvents";
import { logger } from "../utils/logger";
import { withEngineMetrics } from "../monitoring/engineMetrics";
import { getRedisOrNull } from "../queue/redis";

export function createTriageWorker() {
  const connection = getRedisOrNull();
  if (!connection) {
    logger.warn("[TriageWorker] Redis unavailable — triage worker not started");
    return null;
  }

  const worker = new Worker(
    "triage",
    async (job) => {
      return withEngineMetrics("triage-engine", job.data?.clinicId, async () => {
        logger.info("Triage job processing", {
          jobId: job.id,
          traceId: job.data?.traceId
        });

        await upsertJobRecord({
          id: job.id!,
          clinicId: job.data?.clinicId,
          queueName: "triage",
          jobName: job.name,
          status: "processing",
          payload: job.data
        });

        return {
          disposition: "review",
          confidence: 0.9
        };
      });
    },
    { connection }
  );

  attachWorkerEvents(worker, "triage");
  return worker;
}
