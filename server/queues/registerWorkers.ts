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

    createTriageWorker();
    createNotificationWorker();
    createLearningWorker();

    workersRegistered = true;
    logger.info("BullMQ workers registered", { workers: ["triage", "notification", "learning"] });
  } catch (err: any) {
    logger.error("Failed to register workers", { error: err?.message });
  }
}
