import { Request, Response, NextFunction } from "express";
import { getRegionConfig, RegionConfig } from "./regionRouter";

declare global {
  namespace Express {
    interface Request {
      region?: RegionConfig;
    }
  }
}

export function regionMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const country =
    (req.headers["x-country"] as string) ||
    (req.headers["cf-ipcountry"] as string) ||
    "US";

  req.region = getRegionConfig(country);
  next();
}
