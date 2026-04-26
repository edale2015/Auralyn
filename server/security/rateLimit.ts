import type { NextFunction, Request, Response } from "express";

interface Bucket {
  count: number;
  resetAt: number;
}

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  keyPrefix?: string;
  key?: (req: Request) => string;
}

const buckets = new Map<string, Bucket>();
let lastSweep = Date.now();

function sweepExpired(now: number): void {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export function createRateLimiter(options: RateLimitOptions) {
  const prefix = options.keyPrefix ?? "rl";
  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    sweepExpired(now);

    const principal = options.key?.(req) ?? req.user?.userId ?? req.ip ?? req.socket.remoteAddress ?? "unknown";
    const key = `${prefix}:${principal}`;
    const existing = buckets.get(key);
    const bucket = existing && existing.resetAt > now
      ? existing
      : { count: 0, resetAt: now + options.windowMs };

    bucket.count += 1;
    buckets.set(key, bucket);

    const remaining = Math.max(0, options.max - bucket.count);
    res.setHeader("X-RateLimit-Limit", String(options.max));
    res.setHeader("X-RateLimit-Remaining", String(remaining));
    res.setHeader("X-RateLimit-Reset", String(Math.ceil(bucket.resetAt / 1000)));

    if (bucket.count > options.max) {
      res.status(429).json({ ok: false, error: "Rate limit exceeded" });
      return;
    }

    next();
  };
}
