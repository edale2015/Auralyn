import { Request, Response, NextFunction } from "express";
import { recordRequest } from "../monitoring/metricsStore";

export function metricsMiddleware(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();

  res.on("finish", () => {
    const latency = Date.now() - start;
    const isError = res.statusCode >= 400;
    recordRequest(latency, isError);
  });

  next();
}
