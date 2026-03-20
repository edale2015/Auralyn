const inMemoryLocks = new Set<string>();
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
    return redisClient;
  } catch {
    redisClient = null;
    return null;
  }
}

export async function acquireLock(key: string, ttlMs = 5000): Promise<boolean> {
  const redis = await getRedis();

  if (redis) {
    try {
      const result = await redis.set(key, "1", "NX", "PX", ttlMs);
      return result === "OK";
    } catch {}
  }

  if (inMemoryLocks.has(key)) return false;
  inMemoryLocks.add(key);
  setTimeout(() => inMemoryLocks.delete(key), ttlMs).unref();
  return true;
}

export async function releaseLock(key: string): Promise<void> {
  const redis = await getRedis();
  if (redis) {
    try { await redis.del(key); return; } catch {}
  }
  inMemoryLocks.delete(key);
}
