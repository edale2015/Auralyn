import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export interface CorrelatedRequest extends Request {
  correlationId?: string;
}

export function correlationMiddleware(req: CorrelatedRequest, res: Response, next: NextFunction) {
  const incoming = req.header('x-correlation-id');
  const correlationId =
    incoming && incoming.trim().length > 0 ? incoming.trim() : crypto.randomUUID();
  req.correlationId = correlationId;
  res.setHeader('x-correlation-id', correlationId);
  next();
}
