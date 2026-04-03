import { ENV } from "../../config/env";
import { logger } from "../../utils/logger";

let _conn: any = null;
let _initAttempted = false;

export function getBullConnection(): any {
  if (_conn) return _conn;
  if (_initAttempted) return null;

  _initAttempted = true;

  if (!ENV.REDIS_URL || ENV.REDIS_URL.startsWith("https://")) {
    logger.info("[BullMQ] REDIS_URL absent or Upstash REST — BullMQ ioredis disabled");
    return null;
  }

  try {
    const IORedis = require("ioredis");
    _conn = new IORedis(ENV.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      lazyConnect: true,
      connectTimeout: 4000,
      retryStrategy: () => null,
    });
    _conn.on("error", () => {});
    logger.info("[BullMQ] ioredis connection created (lazy)");
    return _conn;
  } catch (e: any) {
    logger.warn("[BullMQ] ioredis init failed — BullMQ disabled", { message: e?.message?.slice(0, 120) });
    _conn = null;
    return null;
  }
}

export function isBullAvailable(): boolean {
  return Boolean(ENV.REDIS_URL) && !ENV.REDIS_URL.startsWith("https://");
}
