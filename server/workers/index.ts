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
    eventName: "workers.startup",
    severity: "info",
    source: "workers",
    payload: { nodeEnv: process.env.NODE_ENV || "development" }
  });

  console.log("✅ Workers started");
}

start().catch((err) => {
  console.error("[workers] Fatal startup error:", err?.message || err);
  process.exit(1);
});
