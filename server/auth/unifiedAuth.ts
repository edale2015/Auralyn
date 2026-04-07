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

// Re-export types so existing code importing from unifiedAuth.ts keeps working
export type { AuthRole, AccessTokenPayload };
// Backward-compat alias
export type AuthUser = { id: string; email?: string; role: AuthRole; clinicId?: string };
export type AuthTokenPayload = AccessTokenPayload;

// ── Fail-fast JWT secret validation ──────────────────────────────────────────
//
// SECURITY FIX: original `getJwtSecret()` returned "dev-jwt-secret-DO-NOT-USE-IN-PROD"
// when JWT_SECRET was unset. This string is in source control — any attacker who
// knows the codebase can forge tokens if the secret is unset in a production deploy.
//
// FIX (ChatGPT + Claude both recommended this):
//   Validate at module import time — server cannot reach the request phase with
//   a misconfigured secret. In prod, a missing or weak secret is a hard error.
//   In dev, we generate a fresh random secret each run (per-session: tokens don't
//   survive restarts, which is fine in dev) rather than use a known string.
//
// NOTE: algorithm, issuer, and audience are now pinned on sign.
//   Issuer/audience enforcement is intentionally NOT enabled on verify yet —
//   existing tokens (12h TTL) don't carry these claims. Enable after one TTL
//   cycle by adding `issuer: JWT_ISSUER, audience: JWT_AUDIENCE` to verifyOptions.

const JWT_SECRET: string = (() => {
  const raw = ENV.JWT_SECRET;
  const isProd = ENV.NODE_ENV === "production";

  if (!raw) {
    if (isProd) {
      // Hard failure in production — do not boot without a configured secret
      throw new Error(
        "FATAL: JWT_SECRET is not configured. " +
        "Set a cryptographically random secret of ≥32 characters before starting the server."
      );
    }
    // Dev: generate a random per-session secret — not known to attackers, not reused
    const devSecret = generateDevSecret();
    console.warn(
      "[Auth] WARNING: JWT_SECRET is not set. " +
      "Using a random per-session dev secret — tokens will be invalidated on restart. " +
      "Set JWT_SECRET in your environment for stable sessions."
    );
    return devSecret;
  }

  if (raw.length < 32) {
    if (isProd) {
      throw new Error(
        `FATAL: JWT_SECRET is only ${raw.length} characters. ` +
        "Use a cryptographically random secret of ≥32 characters in production."
      );
    }
    console.warn(
      `[Auth] WARNING: JWT_SECRET is only ${raw.length} characters. ` +
      "Use ≥32 characters for adequate entropy."
    );
  }

  return raw;
})();

// ── Token signing ─────────────────────────────────────────────────────────────
//
// New tokens include:
//   - sub  : standard JWT subject claim, same value as id (added for JWT compliance
//             and backward compat with code reading req.physician?.sub)
//   - jti  : unique per-token ID, required for future revocation support
//   - iss  : issuer, for future verification pinning
//   - aud  : audience, for future verification pinning
//   - alg  : HS256 explicitly set — prevents algorithm confusion attacks
//
// Email is kept in the token payload (existing expectation in some routes),
// but note that for PHI minimization you should strip it in future and fetch
// from DB on demand using the sub/id claim.

export function signAccessToken(user: AuthUser): string {
  return jwt.sign(
    {
      id:       user.id,
      sub:      user.id,           // standard JWT subject
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

// ── Token verification ────────────────────────────────────────────────────────
//
// Two improvements over the original cast:
//  1. Algorithm is pinned to HS256 — prevents algorithm confusion (e.g. "none")
//  2. Decoded payload is parsed through Zod — rejects malformed claims at runtime
//
// Issuer and audience are intentionally NOT enforced yet (see comment above).
// To enable, add: issuer: JWT_ISSUER, audience: JWT_AUDIENCE to verifyOptions below.

export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, JWT_SECRET, {
    algorithms: [JWT_ALGORITHM],
  });

  // Zod parse — throws ZodError if claims are missing or have wrong types.
  // This turns a silent cast failure into an explicit, logged error.
  return AccessTokenPayloadSchema.parse(decoded);
}

// ── Error type guards ─────────────────────────────────────────────────────────
// Exported so middleware can distinguish expiry from forgery in audit logs.
// (HIPAA §164.312(b) requires distinguishing authentication failure types.)
//
// NOTE: jsonwebtoken is a CommonJS module — its error classes cannot be imported
// as named exports in this ESM context. We check the `name` property instead of
// `instanceof`, which is reliable because jsonwebtoken sets `err.name` on every error.

export function isTokenExpiredError(err: unknown): boolean {
  return (err as any)?.name === "TokenExpiredError";
}

export function isJwtError(err: unknown): boolean {
  return (err as any)?.name === "JsonWebTokenError" ||
         (err as any)?.name === "NotBeforeError";
}
