/**
 * server/auth.ts — Cookie-based provider session (web app layer)
 *
 * FIXES (Code Review Issues #1, #2):
 *   Issue #1: Session token had no user identity binding — attaching only
 *     `{ role: "provider" }`. Any valid signed cookie = generic "provider"
 *     with no accountability. Fixed: userId + clinicId + role are encoded in
 *     the session body and decoded on every request.
 *   Issue #2: No tenant scoping. Fixed: clinicId is stored in the session and
 *     attached to req.provider so downstream middleware can enforce it.
 *   Security: HMAC-SHA256 over the full body (including userId/clinicId) —
 *     tampering with any field invalidates the signature.
 */

import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";

const COOKIE_NAME = process.env.SESSION_COOKIE_NAME || "medsess";
const TTL_HOURS   = Number(process.env.SESSION_TTL_HOURS || 12);

// ── Identity attached to every request after auth ─────────────────────────────

export interface ProviderIdentity {
  userId:   string;
  clinicId: string;
  role:     string;
  via?:     "cookie" | "api-key";
}

declare global {
  namespace Express {
    interface Request {
      provider?: ProviderIdentity;
    }
  }
}

// ── HMAC helpers ──────────────────────────────────────────────────────────────

function sign(payload: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

function timingSafeCompare(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  try { return crypto.timingSafeEqual(aBuf, bBuf); } catch { return false; }
}

// ── Session issuance ──────────────────────────────────────────────────────────
// Cookie value format: base64(userId|clinicId|role|issuedAt|expiresAt).sig
// All identity fields are bound to the HMAC so they cannot be forged.

export interface SessionUser {
  userId:   string;
  clinicId: string;
  role:     string;
}

export function setProviderSession(res: Response, user: SessionUser): void {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("Missing SESSION_SECRET");

  const issuedAt  = Date.now();
  const expiresAt = issuedAt + TTL_HOURS * 60 * 60 * 1000;
  const nonce     = crypto.randomBytes(16).toString("hex");

  // Encode identity + timing in the body — all fields are HMAC-protected
  const body = Buffer.from(
    JSON.stringify({ userId: user.userId, clinicId: user.clinicId, role: user.role, issuedAt, expiresAt, nonce })
  ).toString("base64url");

  const sig   = sign(body, secret);
  const value = `${body}.${sig}`;

  const isProd = process.env.NODE_ENV === "production";

  res.cookie(COOKIE_NAME, value, {
    httpOnly: true,
    secure:   isProd || process.env.COOKIE_SECURE === "1",
    sameSite: "lax",
    expires:  new Date(expiresAt),
    path:     "/",
  });
}

export function clearProviderSession(res: Response): void {
  res.clearCookie(COOKIE_NAME, { path: "/" });
}

// ── Session parsing ───────────────────────────────────────────────────────────

function parseSession(raw: string, secret: string): ProviderIdentity | null {
  const dotIdx = raw.lastIndexOf(".");
  if (dotIdx === -1) return null;

  const body = raw.slice(0, dotIdx);
  const sig  = raw.slice(dotIdx + 1);

  if (!timingSafeCompare(sig, sign(body, secret))) return null;

  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    const { userId, clinicId, role, expiresAt } = parsed;

    if (!userId || !clinicId || !role) return null;
    if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return null;

    return { userId, clinicId, role, via: "cookie" };
  } catch {
    return null;
  }
}

// ── Public helpers ────────────────────────────────────────────────────────────

export function isSessionValid(req: Request): boolean {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return false;
  const raw = req.cookies?.[COOKIE_NAME];
  if (!raw) return false;
  return parseSession(String(raw), secret) !== null;
}

// ── Middleware ────────────────────────────────────────────────────────────────

export function requireProviderSession(req: Request, res: Response, next: NextFunction): void {
  const secret = process.env.SESSION_SECRET;
  if (!secret) { res.status(500).json({ ok: false, error: "Missing SESSION_SECRET" }); return; }

  const raw = req.cookies?.[COOKIE_NAME];
  if (!raw) { res.status(401).json({ ok: false, error: "Not authenticated" }); return; }

  const identity = parseSession(String(raw), secret);
  if (!identity) { res.status(401).json({ ok: false, error: "Invalid or expired session" }); return; }

  req.provider = identity;
  next();
}

/**
 * requireProviderAuth — accepts either cookie session OR X-Provider-Key (dev only).
 * Both paths now attach full ProviderIdentity to req.provider.
 *
 * NOTE: X-Provider-Key is disabled in production. For production, use setProviderSession
 * with a real userId/clinicId/role — do NOT pass placeholder values.
 */
export function requireProviderAuth(req: Request, res: Response, next: NextFunction): void {
  const secret = process.env.SESSION_SECRET;

  // 1. Try cookie first
  if (secret) {
    const raw = req.cookies?.[COOKIE_NAME];
    if (raw) {
      const identity = parseSession(String(raw), secret);
      if (identity) {
        req.provider = identity;
        return next();
      }
    }
  }

  // 2. Dev-only API key fallback (disabled in production)
  const isProd = process.env.NODE_ENV === "production";
  if (!isProd && process.env.ALLOW_PROVIDER_KEY_FALLBACK !== "0") {
    const apiKey     = req.headers["x-provider-key"];
    const expectedKey = process.env.PROVIDER_API_KEY;
    if (expectedKey && apiKey === expectedKey) {
      req.provider = {
        userId:   "dev-provider",
        clinicId: process.env.DEV_CLINIC_ID || "dev-clinic",
        role:     "physician",
        via:      "api-key",
      };
      return next();
    }
  }

  res.status(401).json({ ok: false, error: "Not authenticated" });
}

/**
 * requireRole(roles) — middleware factory for role-based access control.
 * Works alongside requireProviderAuth/requireProviderSession.
 * Also works with requirePhysician (which attaches req.physician not req.provider).
 *
 * Usage: router.get('/admin', requireProviderAuth, requireRole(['admin']), handler)
 */
export function requireRole(roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const role = req.provider?.role ?? (req as any).physician?.role;
    if (!role || !roles.includes(role)) {
      res.status(403).json({ ok: false, error: "Insufficient privileges" });
      return;
    }
    next();
  };
}

/**
 * requireTenantMatch(paramName) — verifies that the tenant in the request
 * matches the authenticated user's clinicId. Prevents cross-tenant access.
 *
 * Usage: router.get('/clinic/:clinicId/data', requireTenantMatch('clinicId'), handler)
 */
export function requireTenantMatch(paramName = "clinicId") {
  return (req: Request, res: Response, next: NextFunction): void => {
    const requestedClinic = req.params[paramName] || (req.body as any)?.[paramName];
    const authedClinic    = req.provider?.clinicId ?? (req as any).physician?.clinicId;

    if (!authedClinic) {
      res.status(401).json({ ok: false, error: "No tenant identity in session" });
      return;
    }
    if (requestedClinic && requestedClinic !== authedClinic) {
      res.status(403).json({ ok: false, error: "Tenant mismatch — cross-tenant access denied" });
      return;
    }
    next();
  };
}
