import type { Request, Response, NextFunction } from "express";

const FDA_DISCLAIMER = "This system provides clinical decision support only. Final decisions are made by a licensed physician. Not intended to replace professional medical judgment.";

export function fdaGuard(_req: Request, res: Response, next: NextFunction) {
  res.locals.disclaimer = FDA_DISCLAIMER;
  const originalJson = res.json.bind(res);
  res.json = function (data: any) {
    if (typeof data === "object" && data !== null && !Array.isArray(data)) {
      data.disclaimer = FDA_DISCLAIMER;
    }
    return originalJson(data);
  };
  next();
}

export function getFDADisclaimer(): string {
  return FDA_DISCLAIMER;
}
