import { appendSystemEvent } from "../repos/systemEventRepo";
import { assertProductionSafe } from "../config/assertProductionSafe";
import { assertRuntimeModes } from "../config/assertRuntimeModes";
import { assertQueueReady } from "../config/assertQueueReady";
import { testDbConnection } from "../db/dbRouter";
import { validateConfig } from "../config/validateConfig";

async function start() {
  validateConfig();
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

  console.log("✅ Scheduler started");
}

start().catch((err) => {
  console.error("[scheduler] Fatal startup error:", err?.message || err);
  process.exit(1);
});
