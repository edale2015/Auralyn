import type { Request, Response, NextFunction } from "express";
import { emitEvent } from "../controlTower/eventBus";

export function withDeadline(ms = 3000) {
  return (req: Request, res: Response, next: NextFunction) => {
    let fired = false;

    const timer = setTimeout(() => {
      if (res.headersSent) return;
      fired = true;

      emitEvent({
        type: "ALERT",
        payload: {
          message: `Request timeout after ${ms}ms: ${req.method} ${req.path}`,
          severity: "HIGH",
          path: req.path,
          method: req.method,
        },
        timestamp: Date.now(),
      });

      res.status(504).json({
        error: "Request timeout",
        message: `The server did not respond within ${ms}ms. Please retry.`,
        path: req.path,
      });
    }, ms);

    res.on("finish", () => {
      if (!fired) clearTimeout(timer);
    });

    res.on("close", () => {
      clearTimeout(timer);
    });

    next();
  };
}

export const clinicalDeadline = withDeadline(8000);
export const standardDeadline = withDeadline(5000);
export const fastDeadline = withDeadline(2000);
