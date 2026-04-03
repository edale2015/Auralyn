import { createTrackedWorker } from "../queues/bullmq/baseWorker";
import { QUEUE_NAMES } from "../queues/bullmq/queueNames";
import { logger } from "../utils/logger";

export function createEhrOutboundWorker() {
  return createTrackedWorker(
    QUEUE_NAMES.EHR_OUTBOUND,
    async (job) => {
      const { sendToEhr } = await import("../services/ehrAdapter");
      const data = job.data as any;

      const result = await sendToEhr({
        patientId: data.patientId,
        encounterId: data.encounterId,
        clinicId: data.clinicId,
        payload: data.payload ?? {},
        targetSystem: data.targetSystem ?? "ecw",
      });

      logger.info("[EhrOutboundWorker] EHR delivery complete", {
        patientId: data.patientId,
        success: result?.success,
      });
      return result;
    },
    { concurrency: 3 }
  );
}
