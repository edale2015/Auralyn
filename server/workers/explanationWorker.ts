import { createTrackedWorker } from "../queues/bullmq/baseWorker";
import { QUEUE_NAMES } from "../queues/bullmq/queueNames";
import { logger } from "../utils/logger";

export function createExplanationWorker() {
  return createTrackedWorker(
    QUEUE_NAMES.EXPLANATION,
    async (job) => {
      const data = job.data as any;

      logger.info("[ExplanationWorker] Generating clinical explanation", {
        sessionId: data.sessionId,
        complaint: data.complaint,
      });

      const { enqueueExplanation } = await import("../llm/asyncLLM");

      const queued = enqueueExplanation({
        complaint: data.complaint,
        assessment: data.assessment,
        sessionId: data.sessionId,
        clinicId: data.clinicId,
      });

      return {
        sessionId: data.sessionId,
        asyncJobId: queued.jobId,
        status: queued.status,
      };
    },
    { concurrency: 2 }
  );
}
