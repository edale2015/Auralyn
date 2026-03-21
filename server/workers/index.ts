import { appendSystemEvent } from "../repos/systemEventRepo";
import { assertProductionSafe } from "../config/assertProductionSafe";
import { assertRuntimeModes } from "../config/assertRuntimeModes";
import { assertQueueReady } from "../config/assertQueueReady";
import { testDbConnection } from "../db";
import { validateConfig } from "../config/validateConfig";
import { startTelemetry, stopTelemetry } from "../monitoring/otel";
import { logger } from "../utils/logger";
import { startWorkerHeartbeat } from "../monitoring/workerHeartbeat";

async function start() {
  validateConfig();
  await startTelemetry("med-scribe-workers");

  assertProductionSafe();
  assertRuntimeModes();

  await testDbConnection();
  await assertQueueReady();

  await appendSystemEvent({
    eventName: "workers.startup",
    severity: "info",
    source: "workers",
    payload: { nodeEnv: process.env.NODE_ENV || "development" }
  });

  const stopHeartbeat = startWorkerHeartbeat("core-workers");

  logger.info("Workers started");

  const shutdown = async () => {
    logger.info("Workers shutdown initiated");
    stopHeartbeat();
    await stopTelemetry();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

start().catch((err) => {
  console.error("[workers] Fatal startup error:", err?.message || err);
  process.exit(1);
});
