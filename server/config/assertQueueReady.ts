import { ENV } from "./env";

export async function assertQueueReady() {
  if (ENV.NODE_ENV !== "production") return;

  const hasUpstash = !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
  const hasTcpRedis = ENV.REDIS_URL && !ENV.REDIS_URL.includes("upstash.io");

  if (!hasUpstash && !hasTcpRedis) {
    throw new Error("❌ [STARTUP FATAL] Redis is required in production. Set UPSTASH_REDIS_REST_URL/TOKEN or a TCP REDIS_URL.");
  }

  try {
    const { getRedisAsync } = await import("../queue/redis");
    const redis = await Promise.race([
      getRedisAsync(),
      new Promise<null>(r => setTimeout(() => r(null), 6000)),
    ]);
    if (!redis) throw new Error("Redis client unavailable after timeout");
    const pong = await redis.ping();
    if (pong !== "PONG") throw new Error("Redis ping did not return PONG");
  } catch (err: any) {
    throw new Error(`❌ [STARTUP FATAL] Redis is required in production but is unavailable: ${err?.message}`);
  }
}
