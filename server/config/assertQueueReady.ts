import { ENV } from "./env";

export async function assertQueueReady() {
  if (ENV.NODE_ENV !== "production") return;

  if (!ENV.REDIS_URL) {
    throw new Error("❌ [STARTUP FATAL] REDIS_URL is required in production");
  }

  try {
    const IORedis = (await import("ioredis")).default;
    const redis = new IORedis(ENV.REDIS_URL, {
      maxRetriesPerRequest: 1,
      connectTimeout: 5000,
    });

    const pong = await redis.ping();
    await redis.disconnect();

    if (pong !== "PONG") {
      throw new Error("Redis ping did not return PONG");
    }
  } catch (err: any) {
    throw new Error(`❌ [STARTUP FATAL] Redis is required in production but is unavailable: ${err?.message}`);
  }
}
