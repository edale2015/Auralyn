// Redis client for queue/BullMQ usage
// Uses Upstash REST client when UPSTASH_REDIS_REST_URL + TOKEN are set,
// otherwise falls back to ioredis with REDIS_URL, otherwise returns null.
import { ENV } from "../config/env";

let _upstashClient: any = null;
let _ioredisClient: any = null;
let _initialized = false;

async function init() {
  if (_initialized) return;
  _initialized = true;

  const restUrl = process.env.UPSTASH_REDIS_REST_URL;
  const restToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (restUrl && restToken) {
    try {
      const { Redis } = await import("@upstash/redis");
      _upstashClient = new Redis({ url: restUrl, token: restToken });
      await _upstashClient.ping();
      console.log("[Redis] Upstash REST client ready");
      return;
    } catch (e: any) {
      console.warn("[Redis] Upstash REST init failed:", e?.message);
      _upstashClient = null;
    }
  }

  if (ENV.REDIS_URL) {
    try {
      const IORedis = (await import("ioredis")).default;
      _ioredisClient = new IORedis(ENV.REDIS_URL, {
        maxRetriesPerRequest: 1,
        connectTimeout: 4000,
        retryStrategy: () => null,
        lazyConnect: true,
      });
      _ioredisClient.on("error", (err: any) => {
        // suppress after first
      });
      await _ioredisClient.connect();
      const pong = await _ioredisClient.ping();
      if (pong !== "PONG") throw new Error("Unexpected ping response");
      console.log("[Redis] ioredis client ready");
    } catch (e: any) {
      console.warn("[Redis] ioredis init failed:", e?.message);
      _ioredisClient = null;
    }
  }
}

// Returns a ping-able client that has at minimum .ping() and .set()/.get()
// Returns null if no Redis is available
export async function getRedisAsync(): Promise<any | null> {
  await init();
  return _upstashClient ?? _ioredisClient ?? null;
}

// Synchronous version — returns null synchronously (triggers async init in background)
export function getRedisOrNull(): any | null {
  init().catch(() => {});
  return _upstashClient ?? _ioredisClient ?? null;
}

// Legacy sync accessor used by BullMQ workers — only works after init() resolves
export function getRedis(): any {
  const client = _upstashClient ?? _ioredisClient;
  if (!client) throw new Error("Redis not available — no UPSTASH_REDIS_REST_URL or REDIS_URL configured");
  return client;
}
