import type { Request, Response, NextFunction } from "express";

let redisClient: any = null;

async function getRedisClient() {
  if (redisClient) return redisClient;
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) return null;
  try {
    const IORedis = (await import("ioredis")).default;
    redisClient = new IORedis(redisUrl, { maxRetriesPerRequest: 1, lazyConnect: true });
    await redisClient.connect().catch(() => { redisClient = null; });
    return redisClient;
  } catch {
    redisClient = null;
    return null;
  }
}

const inMemoryCounters: Map<string, { count: number; expiresAt: number }> = new Map();

async function incrementCounter(key: string, windowSecs: number): Promise<number> {
  const redis = await getRedisClient();
  if (redis) {
    try {
      const count = await redis.incr(key);
      if (count === 1) await redis.expire(key, windowSecs);
      return count;
    } catch {
    }
  }

  const now = Date.now();
  const entry = inMemoryCounters.get(key);
  if (!entry || now > entry.expiresAt) {
    inMemoryCounters.set(key, { count: 1, expiresAt: now + windowSecs * 1000 });
    return 1;
  }
  entry.count++;
  return entry.count;
}

export interface RedisRateLimitOptions {
  windowSecs?: number;
  max?: number;
  keyFn?: (req: Request) => string;
  message?: string;
}

export function redisRateLimit(options: RedisRateLimitOptions = {}) {
  const {
    windowSecs = 60,
    max = 100,
    keyFn = (req) => req.ip ?? "global",
    message = "Too many requests. Please try again later.",
  } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    const key = `ratelimit:${keyFn(req)}`;
    try {
      const count = await incrementCounter(key, windowSecs);
      res.setHeader("X-RateLimit-Limit", max);
      res.setHeader("X-RateLimit-Remaining", Math.max(0, max - count));
      if (count > max) {
        return res.status(429).json({ error: message, retryAfter: windowSecs });
      }
      next();
    } catch {
      next();
    }
  };
}

export function apiRateLimit() {
  return redisRateLimit({ windowSecs: 60, max: 100 });
}

export function heavyRateLimit() {
  return redisRateLimit({ windowSecs: 60, max: 10, message: "Rate limit exceeded for heavy operations." });
}

export function intakeRateLimit() {
  return redisRateLimit({ windowSecs: 60, max: 30, keyFn: (req) => req.ip ?? "global", message: "Intake rate limit exceeded. Please wait before submitting again." });
}
