import { ENV } from "../../config/env";
import { logger } from "../../utils/logger";

let _conn: any = null;
let _reachable: boolean | null = null;  // null=probe in progress, true=ok, false=unreachable

/**
 * Eager async probe at module load.
 * Sets _reachable = true/false within ~3 s.
 * All callers of getBullConnection() / isBullAvailable() that run after startup
 * (~3+ s after module load) will see the correct state and never create
 * BullMQ Queue/Worker objects with an unreachable connection.
 */
(async () => {
  if (!ENV.REDIS_URL || ENV.REDIS_URL.startsWith("https://")) {
    logger.info("[BullMQ] REDIS_URL absent or Upstash REST — BullMQ ioredis disabled");
    _reachable = false;
    return;
  }

  try {
    const IORedis = require("ioredis");
    const probe = new IORedis(ENV.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      lazyConnect: true,
      connectTimeout: 3000,
      retryStrategy: () => null,
    });
    probe.on("error", () => {/* suppress */});
    probe.on("close", () => { if (_reachable) { _conn = null; _reachable = false; } });
    probe.on("end",   () => { if (_reachable) { _conn = null; _reachable = false; } });

    await probe.connect();
    const pong = await probe.ping();
    if (pong !== "PONG") throw new Error("unexpected ping response");

    _conn = probe;
    _reachable = true;
    logger.info("[BullMQ] ioredis connection verified — BullMQ enabled");
  } catch {
    _reachable = false;
    logger.info("[BullMQ] Redis unreachable — BullMQ disabled (no ioredis connection will be attempted again)");
  }
})();

/** Returns the shared ioredis connection, or null if Redis is unreachable or probe pending. */
export function getBullConnection(): any {
  return _reachable === true ? _conn : null;
}

/** True only after the startup probe confirmed Redis is alive. */
export function isBullAvailable(): boolean {
  return _reachable === true;
}
