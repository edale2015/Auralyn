import jwt from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";

type PhysicianClaims = {
  sub: string;
  role?: string;
  physician?: boolean;
  physicianId?: string;
};

declare global {
  namespace Express {
    interface Request {
      physician?: PhysicianClaims;
    }
  }
}

export function requirePhysician(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const auth = req.headers.authorization;

  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing bearer token" });
    return;
  }

  try {
    const token = auth.slice("Bearer ".length);
    const isProd = process.env.NODE_ENV === "production";
    const secret = process.env.JWT_SECRET || (isProd ? undefined : "dev-jwt-secret-DO-NOT-USE-IN-PROD");
    if (!secret) {
      res.status(500).json({ error: "JWT_SECRET not configured" });
      return;
    }
    const decoded = jwt.verify(token, secret) as PhysicianClaims;

    if (!decoded.physician && decoded.role !== "physician") {
      res.status(403).json({ error: "Physician access required" });
      return;
    }

    req.physician = decoded;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}
