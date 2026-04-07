import { ENV } from "./env";

// ── Banned placeholder values ─────────────────────────────────────────────────
//
// Any secret matching these values causes an immediate fatal throw in production.
// Extend this list whenever a new placeholder appears in docs, READMEs, or
// example .env files — especially if it was ever committed to source control.
//
// The previously-hardcoded dev fallback "dev-jwt-secret-DO-NOT-USE-IN-PROD" has
// been added explicitly because it was in source history.

const BANNED_VALUES = new Set([
  "dev-secret",
  "dev-secret-change-in-prod",
  "dev-jwt-secret",
  "dev-jwt-secret-DO-NOT-USE-IN-PROD",   // was hardcoded as fallback in old unifiedAuth.ts
  "changeme",
  "password",
  "physician123",
  "admin123",
  "demo-password",
  "replace-with-a-long-random-secret",
  "replace-with-a-different-long-random-secret",
  "replace-with-a-strong-password",
  "secret",
  "supersecret",
  "your-secret-here",
  "jwt-secret",
  "session-secret",
]);

function assertRequired(name: string, value: string | undefined): void {
  if (!value || value.trim() === "") {
    throw new Error(`❌ [STARTUP FATAL] Missing required production secret: ${name}`);
  }
}

function assertNotBanned(name: string, value: string | undefined): void {
  if (!value) return;
  if (BANNED_VALUES.has(value.trim())) {
    throw new Error(
      `❌ [STARTUP FATAL] Unsafe placeholder value detected for: ${name}. ` +
      `Replace with a cryptographically random value before deploying.`
    );
  }
}

// FIXED: original had no assertMinLength — any non-empty string passed, including "test" (4 chars).
// NIST SP 800-132 recommends ≥112 bits; 256 bits (32 random bytes) is the practical standard.
function assertMinLength(name: string, value: string | undefined, minLength: number): void {
  if (!value) return; // assertRequired handles the missing case separately
  if (value.length < minLength) {
    throw new Error(
      `❌ [STARTUP FATAL] ${name} is too short (${value.length} chars). ` +
      `Minimum is ${minLength} characters. Generate with: openssl rand -hex ${Math.ceil(minLength / 2)}`
    );
  }
}

// FIXED: original assertProductionSafe had no DATABASE_URL check.
// A production deploy with DATABASE_URL pointing at a dev/localhost DB would
// silently write PHI to the wrong store. Check before accepting any traffic.
function assertDatabaseUrlSafe(value: string | undefined): void {
  if (!value || value.trim() === "") {
    throw new Error("❌ [STARTUP FATAL] Missing required production config: DATABASE_URL");
  }

  // Use URL parser for robustness (handles IPv6, URL-encoded credentials, etc.)
  let parsed: URL | null = null;
  try {
    parsed = new URL(value.replace(/^postgres(ql)?:\/\//, "https://"));
  } catch {
    throw new Error("❌ [STARTUP FATAL] DATABASE_URL is not a valid URL");
  }

  const host = parsed.hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") {
    throw new Error(
      "❌ [STARTUP FATAL] DATABASE_URL points to localhost in production. " +
      "This likely means a dev database is being used in production — PHI would be written to the wrong store."
    );
  }

  const sslmode = parsed.searchParams.get("sslmode");
  const ssl     = parsed.searchParams.get("ssl");
  if (sslmode !== "require" && ssl !== "true") {
    throw new Error(
      "❌ [STARTUP FATAL] DATABASE_URL does not enforce SSL. " +
      "Add ?sslmode=require to satisfy HIPAA §164.312(e)(2)(ii) encryption-in-transit requirement."
    );
  }
}

// FIXED: original assertProductionSafe had no Redis check.
// REDIS_URL is required in production for multi-instance escalation guard.
// Must use TLS (rediss://) for HIPAA compliance.
function assertRedisUrlSafe(value: string | undefined): void {
  if (!value || value.trim() === "") {
    // Only a hard fatal if Upstash is also not configured (Upstash uses HTTPS REST)
    const hasUpstash = !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
    if (!hasUpstash) {
      throw new Error(
        "❌ [STARTUP FATAL] No Redis configured in production. " +
        "Set REDIS_URL (rediss://) or UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN. " +
        "Required for distributed escalation monitoring."
      );
    }
    return; // Upstash REST is HTTPS — no TLS check needed for the URL
  }

  // TCP Redis must use rediss:// (TLS) in production
  if (!value.startsWith("rediss://")) {
    // Exception: Upstash sometimes provides a plain REDIS_URL that routes via REST
    // — if Upstash env vars are also set, that's a valid configuration.
    const hasUpstash = !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
    if (!hasUpstash) {
      throw new Error(
        "❌ [STARTUP FATAL] REDIS_URL does not use TLS (must start with rediss://). " +
        "Required for HIPAA §164.312(e)(2)(ii) encryption-in-transit compliance."
      );
    }
  }
}

/**
 * Hard production safety assertions.
 *
 * Call this FIRST, before runStartupChecks(), before any DB connection.
 * These checks require no I/O — they run synchronously on raw config only.
 *
 * In non-production environments this is a no-op so dev workflows are not
 * disrupted, but it logs warnings for any obviously unsafe values.
 */
export function assertProductionSafe(): void {
  if (ENV.NODE_ENV !== "production") {
    // Warn in non-prod if obviously dangerous values are present
    if (ENV.JWT_SECRET && BANNED_VALUES.has(ENV.JWT_SECRET.trim())) {
      console.warn(
        `⚠️ [Startup] JWT_SECRET uses a known placeholder value in ${ENV.NODE_ENV}. ` +
        "This will throw in production."
      );
    }
    if (ENV.SESSION_SECRET && BANNED_VALUES.has(ENV.SESSION_SECRET.trim())) {
      console.warn(
        `⚠️ [Startup] SESSION_SECRET uses a known placeholder value in ${ENV.NODE_ENV}. ` +
        "This will throw in production."
      );
    }
    return;
  }

  // ── Secrets: presence ────────────────────────────────────────────────────
  assertRequired("JWT_SECRET",     ENV.JWT_SECRET);
  assertRequired("SESSION_SECRET", ENV.SESSION_SECRET);
  // MD_PASSWORD and CLINICIAN_PASSWORD are required only if the bootstrap auth
  // mode is active (not SSO or DB-backed user auth).
  if (process.env.AUTH_MODE !== "sso") {
    assertRequired("MD_PASSWORD",        ENV.MD_PASSWORD);
    assertRequired("CLINICIAN_PASSWORD", ENV.CLINICIAN_PASSWORD);
  }

  // ── Secrets: not placeholder values ─────────────────────────────────────
  assertNotBanned("JWT_SECRET",         ENV.JWT_SECRET);
  assertNotBanned("SESSION_SECRET",     ENV.SESSION_SECRET);
  assertNotBanned("MD_PASSWORD",        ENV.MD_PASSWORD);
  assertNotBanned("CLINICIAN_PASSWORD", ENV.CLINICIAN_PASSWORD);

  // ── Secrets: minimum length (length is a proxy for entropy, not a measure) ──
  // 32 chars = 256-bit key space for random hex/base64 secrets
  assertMinLength("JWT_SECRET",     ENV.JWT_SECRET,     32);
  assertMinLength("SESSION_SECRET", ENV.SESSION_SECRET, 32);
  // Passwords are human-set — 16 chars is a reasonable minimum
  assertMinLength("MD_PASSWORD",        ENV.MD_PASSWORD,        16);
  assertMinLength("CLINICIAN_PASSWORD", ENV.CLINICIAN_PASSWORD, 16);

  // ── Database ─────────────────────────────────────────────────────────────
  assertDatabaseUrlSafe(ENV.DATABASE_URL);

  // ── Redis ─────────────────────────────────────────────────────────────────
  assertRedisUrlSafe(ENV.REDIS_URL);

  // ── Dangerous runtime flags ──────────────────────────────────────────────
  const dangerousFlags = [
    "DEMO_USERS",
    "BYPASS_AUTH",
    "SKIP_SAFETY_GATES",
    "DISABLE_AUDIT",
    "DISABLE_RBAC",
  ];
  for (const flag of dangerousFlags) {
    if (process.env[flag] === "true") {
      throw new Error(
        `❌ [STARTUP FATAL] Dangerous flag ${flag}=true is set in production. ` +
        "This flag must only be used in development."
      );
    }
  }

  console.log("✅ [Startup] assertProductionSafe: all production safety assertions passed");
}
