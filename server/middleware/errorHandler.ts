import { Request, Response, NextFunction } from "express"
import { ApiError } from "../lib/apiError"

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json(err.toJSON())
  }

  const message = err instanceof Error ? err.message : String(err)
  console.error("[ErrorHandler]", message)
  res.status(500).json({ ok: false, error: message, status: 500 })
}
