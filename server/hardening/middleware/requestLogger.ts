import { Request, Response, NextFunction } from "express";
import { logger } from "../../utils/logger";

/**
 * Logs every completed request with method, path, status, duration, and
 * correlation ID. Uses the existing HIPAA-compliant structured logger so
 * all redaction and trace-ID rules are inherited automatically.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const startedAt = Date.now();

  res.on("finish", () => {
    const durationMs = Date.now() - startedAt;
    const level = res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info";

    logger[level]("request_complete", {
      correlationId: req.correlationId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs,
    });
  });

  next();
}
