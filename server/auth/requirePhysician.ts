/**
 * server/auth/requirePhysician.ts — Physician-level auth middleware
 *
 * FIXES (Code Review Issues #1, #2):
 *   Issue #1: Token now carries real user identity (id, clinicId) rather than
 *     a generic "provider" blob.
 *   Issue #2: Added requireTenant() middleware that enforces clinicId matches
 *     the authenticated user's clinic — blocking cross-tenant resource access.
 */

import { Request, Response, NextFunction } from "express";
import { verifyAccessToken, isTokenExpiredError, isJwtError } from "./unifiedAuth";
import { rbacService } from "./rbacService";
import type { AccessTokenPayload } from "./authTypes";

// ── Express augmentation ──────────────────────────────────────────────────────

declare global {
  namespace Express {
    interface Request {
      physician?: {
        id:        string;
        sub:       string;
        email?:    string;
        role:      string;
        clinicId?: string;
      };
    }
  }
}

// ── requirePhysician ──────────────────────────────────────────────────────────

export function requirePhysician(req: Request, res: Response, next: NextFunction): void {
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
    if (isTokenExpiredError(err)) {
      res.status(401).json({ error: "Token expired" });
    } else if (isJwtError(err)) {
      res.status(401).json({ error: "Invalid token" });
    } else {
      res.status(401).json({ error: "Authentication failed" });
    }
    return;
  }

  if (!rbacService.can(decoded.role, "clinical:run")) {
    res.status(403).json({ error: "Physician access required" });
    return;
  }

  req.physician = {
    id:        decoded.id,
    sub:       decoded.sub ?? decoded.id,
    email:     decoded.email,
    role:      decoded.role,
    clinicId:  decoded.clinicId,
  };
  next();
}

// ── requireRole factory — for non-physician roles ─────────────────────────────

export function requireRole(roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const auth = req.headers.authorization;
    if (!auth?.startsWith("Bearer ")) {
      res.status(401).json({ error: "Missing bearer token" });
      return;
    }

    let decoded: AccessTokenPayload;
    try {
      decoded = verifyAccessToken(auth.slice("Bearer ".length));
    } catch (err) {
      res.status(401).json({ error: isTokenExpiredError(err) ? "Token expired" : "Invalid token" });
      return;
    }

    if (!roles.includes(decoded.role) && !rbacService.can(decoded.role, "*" as any)) {
      res.status(403).json({ error: `Role '${decoded.role}' does not have required access` });
      return;
    }

    // Attach identity to request so downstream handlers can use it
    req.physician = {
      id:       decoded.id,
      sub:      decoded.sub ?? decoded.id,
      email:    decoded.email,
      role:     decoded.role,
      clinicId: decoded.clinicId,
    };
    next();
  };
}

// ── requireTenant — cross-tenant access prevention (Issue #2) ─────────────────
//
// Verifies that the clinicId in the route/body matches the authenticated user's
// clinicId. Must be used AFTER requirePhysician or requireRole.
//
// Usage:
//   router.get('/clinic/:clinicId/data',
//     requirePhysician,
//     requireTenant('clinicId'),   // param name
//     handler
//   )

export function requireTenant(paramName = "clinicId") {
  return (req: Request, res: Response, next: NextFunction): void => {
    const requestedClinic = req.params[paramName] ?? (req.body as any)?.[paramName];
    const authedClinic    = req.physician?.clinicId;

    if (!authedClinic) {
      // Token has no clinicId — cannot enforce tenant isolation
      // In production this should be a hard reject; currently warn + allow for
      // backward compat during rollout (flip to reject when all tokens carry clinicId)
      const isProd = process.env.NODE_ENV === "production";
      if (isProd) {
        res.status(403).json({ error: "Token missing clinicId — tenant isolation required" });
        return;
      }
      console.warn("[Auth] requireTenant: token has no clinicId — skipping tenant check (non-production)");
      return next();
    }

    if (requestedClinic && requestedClinic !== authedClinic) {
      res.status(403).json({ error: "Cross-tenant access denied" });
      return;
    }

    next();
  };
}
