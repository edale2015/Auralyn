import { ENV } from "../config/env";

let redisInstance: any = null;

export function getRedis(): any {
  if (!ENV.REDIS_URL) {
    throw new Error("❌ REDIS_URL is not configured");
  }

  if (!redisInstance) {
    const IORedis = require("ioredis");
    redisInstance = new IORedis(ENV.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
    });

    redisInstance.on("error", (err: any) => {
      console.error("[Redis] Connection error:", err?.message || err);
    });
  }

  return redisInstance;
}
