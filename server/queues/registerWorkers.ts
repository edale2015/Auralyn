import { ENV } from "../config/env";
import { logger } from "../utils/logger";

let workersRegistered = false;

export function registerWorkers(): void {
  if (workersRegistered) return;

  if (!ENV.REDIS_URL) {
    logger.warn("REDIS_URL not configured — BullMQ workers not started");
    return;
  }

  try {
    const { createTriageWorker } = require("../workers/triageWorker");
    const { createNotificationWorker } = require("../workers/notificationWorker");
    const { createLearningWorker } = require("../workers/learningWorker");
    const { createAuditWorker } = require("../workers/auditWorker");
    const { createEhrOutboundWorker } = require("../workers/ehrOutboundWorker");
    const { createExplanationWorker } = require("../workers/explanationWorker");
    const { createWebhookWorker } = require("../workers/webhookWorker");
    const { createReportWorker } = require("../workers/reportWorker");
    const { createMetricsWorker } = require("../workers/metricsWorker");
    const { createCareGapWorker } = require("../workers/careGapWorker");

    createTriageWorker();
    createNotificationWorker();
    createLearningWorker();
    createAuditWorker();
    createEhrOutboundWorker();
    createExplanationWorker();
    createWebhookWorker();
    createReportWorker();
    createMetricsWorker();
    createCareGapWorker();

    workersRegistered = true;
    logger.info("BullMQ workers registered", {
      workers: [
        "triage", "notification", "learning",
        "audit", "ehr-outbound", "explanation",
        "webhook", "report", "metrics", "care-gap-detection",
      ],
    });
  } catch (err: any) {
    logger.error("Failed to register workers", { error: err?.message });
  }
}
