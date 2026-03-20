import { Request, Response, NextFunction } from "express";
import { sanitizeForLog } from "../utils/phiSanitizer";

export function phiBoundary(req: Request, res: Response, next: NextFunction) {
  if (process.env.NODE_ENV !== "production") return next();

  const originalJson = res.json.bind(res);
  (res as any).json = (body: unknown) => {
    const sanitized = sanitizeForLog(body);
    return originalJson(sanitized);
  };

  next();
}
