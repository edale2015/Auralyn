import { Request, Response, NextFunction } from "express";

export interface AuditRow {
  id: string;
  user: string;
  role: string;
  action: string;
  path: string;
  method: string;
  status: number;
  latency_ms: number;
  timestamp: string;
}

const auditLog: AuditRow[] = [];
const MAX_AUDIT_ROWS = 10000;

export function auditMiddleware(action: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();

    res.on("finish", () => {
      const user = (req as any).user;
      const row: AuditRow = {
        id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        user: user?.id || user?.email || "unknown",
        role: user?.role || "unknown",
        action,
        path: req.originalUrl,
        method: req.method,
        status: res.statusCode,
        latency_ms: Date.now() - start,
        timestamp: new Date().toISOString(),
      };
      auditLog.push(row);
      if (auditLog.length > MAX_AUDIT_ROWS) {
        auditLog.splice(0, auditLog.length - MAX_AUDIT_ROWS);
      }
    });

    next();
  };
}

export function getAuditLog(limit = 100): AuditRow[] {
  return auditLog.slice(-limit).reverse();
}
