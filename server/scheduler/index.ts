import { appendSystemEvent } from "../repos/systemEventRepo";
import { assertProductionSafe } from "../config/assertProductionSafe";
import { assertRuntimeModes } from "../config/assertRuntimeModes";
import { assertQueueReady } from "../config/assertQueueReady";
import { testDbConnection } from "../db";
import { validateConfig } from "../config/validateConfig";
import { loadAwsSecrets } from "../config/loadAwsSecrets";
import { startTelemetry, stopTelemetry } from "../monitoring/otel";
import { logger } from "../utils/logger";

async function start() {
  await loadAwsSecrets();
  validateConfig();
  await startTelemetry("med-scribe-scheduler");

  assertProductionSafe();
  assertRuntimeModes();

  await testDbConnection();
  await assertQueueReady();

  await appendSystemEvent({
    eventName: "scheduler.startup",
    severity: "info",
    source: "scheduler",
    payload: { nodeEnv: process.env.NODE_ENV || "development" }
  });

  logger.info("Scheduler started");

  const shutdown = async () => {
    logger.info("Scheduler shutdown initiated");
    await stopTelemetry();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

start().catch((err) => {
  console.error("[scheduler] Fatal startup error:", err?.message || err);
  process.exit(1);
});
