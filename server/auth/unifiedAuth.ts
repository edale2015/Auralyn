/**
 * server/auth/unifiedAuth.ts — JWT Bearer token signing and verification
 *
 * FIXES (Code Review Issues #1, #2):
 *   Issue #1: Token now enforces issuer + audience on verify (previously only
 *     set on sign). Tokens from other contexts with the same secret are rejected.
 *   Issue #2: clinicId is required in the payload schema — any token without it
 *     fails Zod validation, preventing cross-tenant ambiguity.
 *
 * Migration note: Tokens issued before this change lack `iss`/`aud` claims.
 * Those tokens expire within 12h (JWT_TTL). After one TTL cycle all live tokens
 * will carry the claims and verification is fully enforced.
 */

import jwt from "jsonwebtoken";
import crypto from "crypto";
import { ENV } from "../config/env";
import {
  AccessTokenPayload,
  AccessTokenPayloadSchema,
  AuthRole,
  JWT_ALGORITHM,
  JWT_AUDIENCE,
  JWT_ISSUER,
  JWT_TTL,
  generateDevSecret,
} from "./authTypes";

export type { AuthRole, AccessTokenPayload };
export type AuthUser = { id: string; email?: string; role: AuthRole; clinicId?: string };
export type AuthTokenPayload = AccessTokenPayload;

// ── JWT secret validation — fail fast ────────────────────────────────────────

const JWT_SECRET: string = (() => {
  const raw    = ENV.JWT_SECRET;
  const isProd = ENV.NODE_ENV === "production";

  if (!raw) {
    if (isProd) throw new Error(
      "FATAL: JWT_SECRET is not configured. Set a cryptographically random secret of ≥32 characters."
    );
    const devSecret = generateDevSecret();
    console.warn("[Auth] JWT_SECRET not set — using random per-session dev secret.");
    return devSecret;
  }

  if (raw.length < 32) {
    if (isProd) throw new Error(
      `FATAL: JWT_SECRET is only ${raw.length} characters. Use ≥32 for adequate entropy.`
    );
    console.warn(`[Auth] JWT_SECRET is only ${raw.length} characters. Use ≥32 in production.`);
  }

  return raw;
})();

// ── Token signing ─────────────────────────────────────────────────────────────

export function signAccessToken(user: AuthUser): string {
  return jwt.sign(
    {
      id:       user.id,
      sub:      user.id,
      email:    user.email,
      role:     user.role,
      clinicId: user.clinicId,
    },
    JWT_SECRET,
    {
      algorithm: JWT_ALGORITHM,
      expiresIn: JWT_TTL,
      issuer:    JWT_ISSUER,
      audience:  JWT_AUDIENCE,
      jwtid:     crypto.randomUUID(),
    },
  );
}

// ── Token verification (FIXED: issuer + audience now enforced on verify) ─────

export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, JWT_SECRET, {
    algorithms: [JWT_ALGORITHM],
    issuer:     JWT_ISSUER,    // FIX: was NOT enforced — tokens from other contexts accepted
    audience:   JWT_AUDIENCE,  // FIX: was NOT enforced — audience confusion possible
  });

  // Zod parse — rejects malformed claims at runtime
  return AccessTokenPayloadSchema.parse(decoded);
}

// ── Error type guards ─────────────────────────────────────────────────────────

export function isTokenExpiredError(err: unknown): boolean {
  return (err as any)?.name === "TokenExpiredError";
}

export function isJwtError(err: unknown): boolean {
  return (err as any)?.name === "JsonWebTokenError" ||
         (err as any)?.name === "NotBeforeError";
}
