import { Request, Response, NextFunction } from "express";

export function requireReviewAuth(req: Request, res: Response, next: NextFunction) {
  if (process.env.REVIEW_AUTH_MODE === "off") return next();

  const token = req.headers["x-review-token"];
  if (!token) return res.status(401).json({ error: "missing review token" });
  return next();
}
