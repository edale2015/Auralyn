import IORedis from "ioredis";
import { ENV } from "../config/env";

let redisInstance: IORedis | null = null;

export function getRedis(): IORedis {
  if (!ENV.REDIS_URL) {
    throw new Error("❌ REDIS_URL is not configured");
  }

  if (!redisInstance) {
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

export function getRedisOrNull(): IORedis | null {
  if (!ENV.REDIS_URL) return null;
  return getRedis();
}
