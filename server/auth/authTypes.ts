import { z } from "zod";
import crypto from "crypto";

// ── Single source of truth for all auth role strings ─────────────────────────
//
// Previously: unifiedAuth.ts had AuthRole ("admin"|"physician"|"reviewer"|"staff")
//             types/auth.ts  had UserRole ("admin"|"physician"|"nurse"|"staff"|"patient"|"viewer")
//             rbacService.ts imported UserRole; verifyAccessToken returned AuthRole
//
// These were silently diverging. Adding a role to one didn't add it to the other.
// Fix: one Zod enum here, imported everywhere. No more duplicate type definitions.

export const AuthRoleSchema = z.enum([
  "admin",
  "physician",
  "reviewer",
  "staff",
  "nurse",
  "patient",
  "viewer",
]);

export type AuthRole = z.infer<typeof AuthRoleSchema>;

// ── Runtime-validated access token payload ────────────────────────────────────
//
// jwt.verify() returns `unknown` cast to a type — TypeScript trusts the cast
// but can't validate it at runtime. A token signed with the correct secret but
// with malformed/missing claims would pass TypeScript and fail silently later.
//
// Fix: parse the decoded JWT through this Zod schema in verifyAccessToken().
// If the claims don't match, we get an explicit error, not a silent undefined.

export const AccessTokenPayloadSchema = z.object({
  // id is our primary user identifier — kept for backward compatibility
  id:         z.string().min(1),
  // sub is the standard JWT "subject" claim — same value as id
  sub:        z.string().min(1).optional(),
  email:      z.string().email().optional(),
  role:       AuthRoleSchema,
  clinicId:   z.string().min(1).optional(),
  // jti (JWT ID) — unique per-token identifier, required for future revocation
  jti:        z.string().min(1).optional(),
  // Standard JWT time claims
  iat:        z.number().optional(),
  exp:        z.number().optional(),
  iss:        z.string().optional(),
  aud:        z.union([z.string(), z.array(z.string())]).optional(),
});

export type AccessTokenPayload = z.infer<typeof AccessTokenPayloadSchema>;

// ── JWT config constants ──────────────────────────────────────────────────────
// Centralised here so unifiedAuth.ts and verifyAccessToken both use the same values.
export const JWT_ISSUER    = "auralyn-auth";
export const JWT_AUDIENCE  = "auralyn-api";
export const JWT_ALGORITHM = "HS256" as const;
export const JWT_TTL       = "12h";

// ── Dev secret generation ─────────────────────────────────────────────────────
// Generates a random 256-bit secret for development use only.
// This is NOT a fallback for production — it is intentionally per-session so
// tokens issued in one dev session are invalid in another.
// The returned secret is a hex string (64 chars = 256 bits).
export function generateDevSecret(): string {
  return crypto.randomBytes(32).toString("hex");
}
