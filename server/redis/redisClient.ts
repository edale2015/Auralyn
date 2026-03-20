import { emitEvent } from "../controlTower/eventBus";

type RedisClientInstance = any;

let primaryClient: RedisClientInstance = null;
let secondaryClient: RedisClientInstance = null;
let activeClient: RedisClientInstance = null;
let initialized = false;
let usingFallback = false;

async function createClient(url: string, label: string): Promise<RedisClientInstance | null> {
  if (!url) return null;
  try {
    const { default: IORedis } = await import("ioredis");
    const client = new IORedis(url, {
      lazyConnect: true,
      connectTimeout: 3000,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
    });
    await client.connect();
    console.log(`[Redis] ${label} connected`);
    return client;
  } catch (e: any) {
    console.warn(`[Redis] ${label} unavailable: ${e?.message}`);
    return null;
  }
}

async function switchToSecondary() {
  if (usingFallback || !secondaryClient) return;
  usingFallback = true;
  activeClient = secondaryClient;
  console.warn("[Redis] Primary failed — switched to secondary");
  emitEvent({
    type: "REGION_STATUS",
    payload: { redis: "SECONDARY_ACTIVE", reason: "primary connection lost" },
    timestamp: Date.now(),
  });
}

export async function getRedisClient(): Promise<RedisClientInstance | null> {
  if (!initialized) {
    initialized = true;
    primaryClient = await createClient(process.env.REDIS_PRIMARY ?? process.env.REDIS_URL ?? "", "primary Redis");
    if (process.env.REDIS_SECONDARY) {
      secondaryClient = await createClient(process.env.REDIS_SECONDARY, "secondary Redis");
    }
    activeClient = primaryClient ?? secondaryClient ?? null;

    if (primaryClient) {
      primaryClient.on("error", () => switchToSecondary().catch(() => {}));
    }
  }
  return activeClient;
}

export async function redisSet(key: string, value: string, opts?: { nx?: boolean; exSeconds?: number; pxMs?: number }): Promise<string | null> {
  const redis = await getRedisClient();
  if (!redis) return null;
  try {
    const args: any[] = [key, value];
    if (opts?.nx) args.push("NX");
    if (opts?.exSeconds) { args.push("EX"); args.push(opts.exSeconds); }
    if (opts?.pxMs) { args.push("PX"); args.push(opts.pxMs); }
    return await redis.set(...args);
  } catch (e: any) {
    await switchToSecondary();
    return null;
  }
}

export async function redisDel(key: string): Promise<void> {
  const redis = await getRedisClient();
  if (!redis) return;
  try { await redis.del(key); } catch {}
}

export async function redisIncr(key: string): Promise<number | null> {
  const redis = await getRedisClient();
  if (!redis) return null;
  try { return await redis.incr(key); } catch { return null; }
}

export async function redisExpire(key: string, seconds: number): Promise<void> {
  const redis = await getRedisClient();
  if (!redis) return;
  try { await redis.expire(key, seconds); } catch {}
}

export function isUsingFallback(): boolean {
  return usingFallback;
}
