import { emitEvent } from "../controlTower/eventBus";
import { isChaosActive } from "../chaos/chaosEngine";

// Upstash Redis REST client — works over HTTPS, no TCP port issues
// Falls back gracefully when credentials are missing
let _client: any = null;
let _initialized = false;
let usingFallback = false;

async function buildUpstashClient(): Promise<any | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  try {
    const { Redis } = await import("@upstash/redis");
    const client = new Redis({ url, token });
    await client.ping();
    console.log("[Redis] Upstash REST client connected");
    return client;
  } catch (e: any) {
    console.warn("[Redis] Upstash REST unavailable:", e?.message);
    return null;
  }
}

async function getClient(): Promise<any | null> {
  if (_initialized) return _client;
  _initialized = true;
  _client = await buildUpstashClient();
  if (!_client) {
    usingFallback = true;
    console.warn("[Redis] No Redis available — running without cache/queue persistence");
  }
  return _client;
}

// Public API — same interface as before so all callers stay unchanged

export async function getRedisClient(): Promise<any | null> {
  return getClient();
}

export async function redisSet(
  key: string,
  value: string,
  opts?: { nx?: boolean; exSeconds?: number; pxMs?: number }
): Promise<string | null> {
  if (isChaosActive("redis_down")) throw new Error("CHAOS_REDIS_DOWN: Redis failure injected");
  const redis = await getClient();
  if (!redis) return null;
  try {
    const setOpts: any = {};
    if (opts?.nx) setOpts.nx = true;
    if (opts?.exSeconds) setOpts.ex = opts.exSeconds;
    if (opts?.pxMs) setOpts.px = opts.pxMs;
    const result = await redis.set(key, value, Object.keys(setOpts).length ? setOpts : undefined);
    return result as string | null;
  } catch (e: any) {
    console.warn("[Redis] set error:", e?.message);
    return null;
  }
}

export async function redisDel(key: string): Promise<void> {
  const redis = await getClient();
  if (!redis) return;
  try { await redis.del(key); } catch {}
}

export async function redisIncr(key: string): Promise<number | null> {
  const redis = await getClient();
  if (!redis) return null;
  try { return await redis.incr(key) as number; } catch { return null; }
}

export async function redisExpire(key: string, seconds: number): Promise<void> {
  const redis = await getClient();
  if (!redis) return;
  try { await redis.expire(key, seconds); } catch {}
}

export function isUsingFallback(): boolean {
  return usingFallback;
}

// Compatibility: some files call getRedisOrNull() synchronously
// Return null synchronously — async init happens lazily on first use
export function getRedisOrNull(): null {
  // Trigger async init in the background without blocking
  getClient().catch(() => {});
  return null;
}
