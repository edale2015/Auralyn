import { Request, Response } from "express"

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ ok: false, error: `Route not found: ${req.method} ${req.path}`, status: 404 })
}
