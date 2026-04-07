import { Request, Response, NextFunction } from "express";
import { verifyAccessToken, isTokenExpiredError, isJwtError } from "./unifiedAuth";
import { rbacService } from "./rbacService";
import type { AccessTokenPayload } from "./authTypes";

// ── Express request augmentation ──────────────────────────────────────────────
//
// req.physician is kept for backward compatibility with routes that read it.
// New code should use req.user (set by requireAuth middleware) instead.
//
// BACKWARD COMPAT: patientQueueRoutes reads `req.physician?.sub` — the token
// now includes `sub` (same value as `id`) so this field is naturally available.

declare global {
  namespace Express {
    interface Request {
      physician?: {
        id:        string;
        sub:       string;   // same as id — kept for patientQueueRoutes compat
        email?:    string;
        role:      string;
        clinicId?: string;
      };
    }
  }
}

// ── requirePhysician ──────────────────────────────────────────────────────────
//
// FIXES vs original:
//  1. Token shape: original expected { sub, physician? } — tokens never had these.
//     signAccessToken produces { id, email, role }. Now delegates to verifyAccessToken.
//  2. Admin lockout: original checked `decoded.role !== "physician"` — admin was
//     always blocked (role:"admin" != "physician"). Now uses rbacService.can()
//     so admin's "*" permission correctly passes clinical:run.
//  3. Split secret: original read process.env.JWT_SECRET directly; unifiedAuth uses
//     ENV. If ENV transforms or defaults differently, verification could fail. Now
//     calls verifyAccessToken() — one path, one secret resolution.
//  4. Error distinction: original returned "Invalid or expired token" for everything.
//     Now distinguishes expiry vs forgery for HIPAA §164.312(b) audit clarity.

export function requirePhysician(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const auth = req.headers.authorization;

  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing bearer token" });
    return;
  }

  const token = auth.slice("Bearer ".length);

  let decoded: AccessTokenPayload;
  try {
    decoded = verifyAccessToken(token);
  } catch (err) {
    // Distinguish expiry from forgery — different audit significance
    if (isTokenExpiredError(err)) {
      res.status(401).json({ error: "Token expired" });
    } else if (isJwtError(err)) {
      res.status(401).json({ error: "Invalid token" });
    } else {
      res.status(401).json({ error: "Authentication failed" });
    }
    return;
  }

  // Use RBAC to determine physician-level access rather than hardcoding role strings.
  // admin has ["*"] which passes can(role, "clinical:run").
  // physician has ["clinical:run", ...] which also passes.
  // Any other role correctly returns 403.
  if (!rbacService.can(decoded.role, "clinical:run")) {
    res.status(403).json({ error: "Physician access required" });
    return;
  }

  req.physician = {
    id:        decoded.id,
    sub:       decoded.sub ?? decoded.id,   // sub may be absent on old tokens
    email:     decoded.email,
    role:      decoded.role,
    clinicId:  decoded.clinicId,
  };
  next();
}
