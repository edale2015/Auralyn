import { Request, Response, NextFunction } from "express"

const seen: Map<string, { status: number; body: unknown; ts: number }> = new Map()
const TTL_MS = 5 * 60 * 1000

export function idempotency(req: Request, res: Response, next: NextFunction) {
  const key = req.headers["idempotency-key"] as string | undefined
  if (!key || req.method === "GET") return next()

  const now = Date.now()
  const cached = seen.get(key)
  if (cached && now - cached.ts < TTL_MS) {
    return res.status(cached.status).json(cached.body)
  }

  const origJson = res.json.bind(res)
  res.json = (body: unknown) => {
    seen.set(key, { status: res.statusCode, body, ts: now })
    return origJson(body)
  }

  next()
}
