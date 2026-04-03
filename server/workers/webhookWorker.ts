import { createTrackedWorker } from "../queues/bullmq/baseWorker";
import { QUEUE_NAMES } from "../queues/bullmq/queueNames";
import { logger } from "../utils/logger";

export function createWebhookWorker() {
  return createTrackedWorker(
    QUEUE_NAMES.WEBHOOK,
    async (job) => {
      const data = job.data as any;

      if (!data.url) {
        throw new Error("Webhook URL is required");
      }

      const response = await fetch(data.url, {
        method: data.method ?? "POST",
        headers: {
          "Content-Type": "application/json",
          ...(data.headers ?? {}),
        },
        body: JSON.stringify(data.body ?? {}),
        signal: AbortSignal.timeout(15_000),
      });

      if (!response.ok) {
        throw new Error(`Webhook delivery failed: HTTP ${response.status}`);
      }

      logger.info("[WebhookWorker] Webhook delivered", {
        url: data.url,
        status: response.status,
      });

      return { delivered: true, status: response.status };
    },
    { concurrency: 5 }
  );
}
