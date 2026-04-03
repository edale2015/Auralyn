import { createTrackedWorker } from "../queues/bullmq/baseWorker";
import { QUEUE_NAMES } from "../queues/bullmq/queueNames";
import { appendAuditLog } from "../repos/auditRepo";
import { logger } from "../utils/logger";

export function createAuditWorker() {
  return createTrackedWorker(
    QUEUE_NAMES.AUDIT,
    async (job) => {
      const data = job.data as any;

      await appendAuditLog({
        eventType: data.eventType ?? "generic",
        clinicId: data.clinicId ?? undefined,
        traceId: data.traceId ?? undefined,
        actorId: data.actorId ?? undefined,
        entityType: data.entityType ?? undefined,
        entityId: data.entityId ?? undefined,
        data: data.details ?? data.data ?? undefined,
      });

      logger.info("[AuditWorker] Audit entry appended", { eventType: data.eventType });
      return { appended: true };
    },
    { concurrency: 10 }
  );
}
