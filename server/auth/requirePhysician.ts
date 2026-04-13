/**
 * server/auth/requirePhysician.ts — Physician-level auth middleware
 *
 * FIX (Batch-1 Finding #5 — High): requireTenant() now hard-rejects any token
 * missing clinicId regardless of NODE_ENV. The previous non-production bypass
 * allowed any staging/CI/dev token without a clinicId to access all clinic data.
 *
 * FIX (Batch-1 Finding #9 — High): requireRole() no longer passes "*" as a
 * Permission to rbacService.can(). Admin check is now an explicit role comparison,
 * not a wildcard permission lookup that only worked for admins and silently
 * denied all other valid roles.
 */

import { Request, Response, NextFunction } from "express";
import { verifyAccessToken, isTokenExpiredError, isJwtError } from "./unifiedAuth";
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

  const PHYSICIAN_ROLES = ["physician", "admin", "nurse_practitioner", "pa"];
  if (!PHYSICIAN_ROLES.includes(decoded.role)) {
    res.status(403).json({ error: "Physician access required" });
    return;
  }

  req.physician = {
    id:       decoded.id,
    sub:      decoded.sub ?? decoded.id,
    email:    decoded.email,
    role:     decoded.role,
    clinicId: decoded.clinicId,
  };
  next();
}

// ── requireRole factory ───────────────────────────────────────────────────────
//
// FIX (Finding #9): Admin check is now `decoded.role === "admin"` — not
// rbacService.can(role, "*") which only returned true for admins and silently
// rejected all other roles that should have passed the role list check.

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

    const isAdmin     = decoded.role === "admin";
    const roleAllowed = roles.includes(decoded.role);

    if (!roleAllowed && !isAdmin) {
      res.status(403).json({ error: `Role '${decoded.role}' does not have required access` });
      return;
    }

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

// ── requireTenant — cross-tenant access prevention ───────────────────────────
//
// FIX (Finding #5): Missing clinicId is now ALWAYS a hard 403 — no bypass
// for non-production. Previous code did console.warn + next() in non-prod,
// silently disabling tenant isolation on any staging or CI environment.

export function requireTenant(paramName = "clinicId") {
  return (req: Request, res: Response, next: NextFunction): void => {
    const requestedClinic = req.params[paramName] ?? (req.body as any)?.[paramName];
    const authedClinic    = req.physician?.clinicId;

    if (!authedClinic) {
      // FIX: Hard reject regardless of NODE_ENV — no backward-compat bypass
      res.status(403).json({
        error: "Token missing clinicId — tenant isolation enforced in all environments",
      });
      return;
    }

    if (requestedClinic && requestedClinic !== authedClinic) {
      res.status(403).json({ error: "Cross-tenant access denied" });
      return;
    }

    next();
  };
}
