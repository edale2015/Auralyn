const inMemoryDedup = new Map<string, number>();
let redisClient: any = null;
let initialized = false;

async function getRedis(): Promise<any | null> {
  if (initialized) return redisClient;
  initialized = true;
  if (!process.env.REDIS_URL) return null;
  try {
    const { default: IORedis } = await import("ioredis");
    redisClient = new IORedis(process.env.REDIS_URL, { lazyConnect: true, connectTimeout: 3000 });
    await redisClient.connect();
    console.log("[RedisDeduper] Connected to Redis");
    return redisClient;
  } catch (e: any) {
    console.warn("[RedisDeduper] Redis unavailable, using in-memory fallback:", e?.message);
    redisClient = null;
    return null;
  }
}

export async function shouldSendAlert(key: string, ttlSeconds = 300): Promise<boolean> {
  const redis = await getRedis();

  if (redis) {
    try {
      const result = await redis.set(key, "1", "NX", "EX", ttlSeconds);
      return result === "OK";
    } catch (e: any) {
      console.warn("[RedisDeduper] Redis op failed, falling back:", e?.message);
    }
  }

  const now = Date.now();
  const ttlMs = ttlSeconds * 1000;
  const last = inMemoryDedup.get(key) ?? 0;
  if (now - last < ttlMs) return false;
  inMemoryDedup.set(key, now);
  return true;
}
