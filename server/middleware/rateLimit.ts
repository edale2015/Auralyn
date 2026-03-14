import { Request, Response, NextFunction } from "express"
import { ApiError } from "../lib/apiError"

const windows: Record<string, { count: number; resetAt: number }> = {}

export function rateLimit(opts: { windowMs: number; max: number; keyFn?: (req: Request) => string }) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const key = opts.keyFn ? opts.keyFn(req) : req.ip ?? "global"
    const now = Date.now()
    const entry = windows[key]

    if (!entry || now > entry.resetAt) {
      windows[key] = { count: 1, resetAt: now + opts.windowMs }
      return next()
    }

    entry.count++
    if (entry.count > opts.max) {
      return next(new ApiError(429, "Too many requests", "RATE_LIMITED"))
    }
    next()
  }
}
