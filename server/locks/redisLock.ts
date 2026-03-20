import { redisSet, redisDel } from "../redis/redisClient";

const inMemoryLocks = new Set<string>();

export async function acquireLock(key: string, ttlMs = 5000): Promise<boolean> {
  const result = await redisSet(key, "1", { nx: true, pxMs: ttlMs });
  if (result === "OK") return true;
  if (result !== null) return false;

  if (inMemoryLocks.has(key)) return false;
  inMemoryLocks.add(key);
  setTimeout(() => inMemoryLocks.delete(key), ttlMs).unref();
  return true;
}

export async function releaseLock(key: string): Promise<void> {
  await redisDel(key);
  inMemoryLocks.delete(key);
}

export async function acquireGlobalLock(key: string, ttlSeconds = 60): Promise<boolean> {
  const result = await redisSet(key, "1", { nx: true, exSeconds: ttlSeconds });
  if (result === "OK") return true;
  if (result !== null) return false;
  if (inMemoryLocks.has(key)) return false;
  inMemoryLocks.add(key);
  setTimeout(() => inMemoryLocks.delete(key), ttlSeconds * 1000).unref();
  return true;
}
