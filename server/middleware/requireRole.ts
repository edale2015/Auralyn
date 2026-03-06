import type { Request, Response, NextFunction } from "express";
import { authService } from "../services/authService";
import type { AuthUser, UserRole } from "../types/auth";

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthUser;
    }
  }
}

function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header) return null;

  const m = header.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

export function requireRole(allowedRoles: UserRole[]) {
  return async function roleMiddleware(req: Request, res: Response, next: NextFunction) {
    try {
      const token = extractBearerToken(req);
      if (!token) {
        res.status(401).json({ error: "Missing bearer token" });
        return;
      }

      const user = await authService.getUserFromToken(token);
      if (!user) {
        res.status(401).json({ error: "Invalid or expired token" });
        return;
      }

      if (!authService.hasRole(user.role, allowedRoles)) {
        res.status(403).json({
          error: "Forbidden",
          role: user.role,
          allowedRoles
        });
        return;
      }

      req.authUser = user;
      next();
    } catch (err: any) {
      res.status(500).json({
        error: err?.message ?? "Authorization failed"
      });
    }
  };
}
