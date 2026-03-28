import { Request, Response, NextFunction } from "express";

const MAX_CONCURRENT = 200;
const PER_IP_WINDOW_MS = 60_000;
const PER_IP_MAX = 300;

let activeConcurrent = 0;

const ipWindows = new Map<string, { count: number; windowStart: number }>();

export function rateLimiter(req: Request, res: Response, next: NextFunction): void {
  if (activeConcurrent >= MAX_CONCURRENT) {
    res.status(429).json({
      error: "System overloaded",
      message: "Too many concurrent requests. Please retry in a few seconds.",
      retryAfterMs: 2000,
    });
    return;
  }

  const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0].trim() ?? req.socket.remoteAddress ?? "unknown";
  const now = Date.now();
  const ipData = ipWindows.get(ip);

  if (!ipData || now - ipData.windowStart > PER_IP_WINDOW_MS) {
    ipWindows.set(ip, { count: 1, windowStart: now });
  } else {
    ipData.count++;
    if (ipData.count > PER_IP_MAX) {
      res.status(429).json({
        error: "Rate limit exceeded",
        message: `Max ${PER_IP_MAX} requests per minute`,
        retryAfterMs: PER_IP_WINDOW_MS - (now - ipData.windowStart),
      });
      return;
    }
  }

  activeConcurrent++;
  res.on("finish", () => { activeConcurrent--; });
  res.on("close", () => { activeConcurrent--; });

  next();
}

export function getRateLimiterStats() {
  return {
    active: true,
    maxConcurrent: MAX_CONCURRENT,
    currentConcurrent: activeConcurrent,
    perIpMax: PER_IP_MAX,
    perIpWindowMs: PER_IP_WINDOW_MS,
    trackedIps: ipWindows.size,
  };
}
