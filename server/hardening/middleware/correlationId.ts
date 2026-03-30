import { randomUUID } from "crypto";
import { Request, Response, NextFunction } from "express";

declare global {
  namespace Express {
    interface Request {
      correlationId?: string;
    }
  }
}

/**
 * Injects a correlation ID into every request.
 * - Reads x-correlation-id header from caller (useful for tracing across services).
 * - Generates a new UUID if none supplied.
 * - Echoes it back in the response header so callers can trace end-to-end.
 */
export function correlationId(req: Request, res: Response, next: NextFunction) {
  const incoming = req.header("x-correlation-id");
  const id = (incoming && incoming.trim()) ? incoming.trim() : randomUUID();

  req.correlationId = id;
  res.setHeader("x-correlation-id", id);

  next();
}
