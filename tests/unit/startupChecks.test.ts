/**
 * Unit tests for startup safety infrastructure.
 *
 * Strategy:
 *  - assertProductionSafe: pure function, tested via env manipulation + module reset
 *  - Sync check functions (checkNodeVersion, checkJwtSecret, etc.): exported and
 *    tested directly so we avoid running the full runStartupChecks() pipeline
 *    which requires live DB/Redis.
 *  - runStartupChecks (integration smoke): confirmed to run without fatal throw
 *    in the standard dev environment (real DB reachable).
 */

import { describe, it, expect, afterEach, vi } from "vitest";

// ── Snapshot original env before any test ────────────────────────────────────
const ORIGINAL_ENV = { ...process.env };

function restoreEnv() {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) delete process.env[key];
  }
  Object.assign(process.env, ORIGINAL_ENV);
}

// ─────────────────────────────────────────────────────────────────────────────
// assertProductionSafe
// ─────────────────────────────────────────────────────────────────────────────

describe("assertProductionSafe", () => {
  async function load() {
    vi.resetModules();
    const { assertProductionSafe } = await import("../../server/config/assertProductionSafe");
    return assertProductionSafe;
  }

  afterEach(() => {
    restoreEnv();
    vi.resetModules();
  });

  it("is a no-op when NODE_ENV is development", async () => {
    process.env.NODE_ENV = "development";
    delete process.env.JWT_SECRET;
    const fn = await load();
    expect(() => fn()).not.toThrow();
  });

  it("is a no-op when NODE_ENV is test", async () => {
    process.env.NODE_ENV = "test";
    delete process.env.JWT_SECRET;
    const fn = await load();
    expect(() => fn()).not.toThrow();
  });

  it("throws when JWT_SECRET is missing in production", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.JWT_SECRET;
    const fn = await load();
    expect(() => fn()).toThrow("Missing required production secret: JWT_SECRET");
  });

  it("throws when JWT_SECRET is a known banned placeholder", async () => {
    process.env.NODE_ENV   = "production";
    process.env.JWT_SECRET = "dev-jwt-secret-DO-NOT-USE-IN-PROD";
    const fn = await load();
    expect(() => fn()).toThrow("Unsafe placeholder value detected for: JWT_SECRET");
  });

  it("throws when JWT_SECRET is shorter than 32 chars (not banned, not empty)", async () => {
    // Provide all other required fields with valid values so the JWT length
    // check is the first (and only) thing that throws.
    process.env.NODE_ENV            = "production";
    process.env.JWT_SECRET          = "onlyfifteench!";              // 15 chars, not banned
    process.env.SESSION_SECRET      = "aB3cD4eF5gH6iJ7kL8mN9oP0qR1sT2uV";  // 32 chars
    process.env.MD_PASSWORD         = "SecurePass1234!!";
    process.env.CLINICIAN_PASSWORD  = "ClinicPass1234!!";
    process.env.DATABASE_URL        = "postgresql://user:pass@db.prod.example.com/prod?sslmode=require";
    process.env.UPSTASH_REDIS_REST_URL   = "https://upstash.example.com";
    process.env.UPSTASH_REDIS_REST_TOKEN = "sometoken";
    delete process.env.REDIS_URL;
    const fn = await load();
    expect(() => fn()).toThrow("JWT_SECRET is too short");
  });

  it("throws when SESSION_SECRET is shorter than 32 chars", async () => {
    process.env.NODE_ENV            = "production";
    process.env.JWT_SECRET          = "aB3cD4eF5gH6iJ7kL8mN9oP0qR1sT2uV";
    process.env.SESSION_SECRET      = "tooshort!!";                  // 10 chars, not banned
    process.env.MD_PASSWORD         = "SecurePass1234!!";
    process.env.CLINICIAN_PASSWORD  = "ClinicPass1234!!";
    process.env.DATABASE_URL        = "postgresql://user:pass@db.prod.example.com/prod?sslmode=require";
    process.env.UPSTASH_REDIS_REST_URL   = "https://upstash.example.com";
    process.env.UPSTASH_REDIS_REST_TOKEN = "sometoken";
    delete process.env.REDIS_URL;
    const fn = await load();
    expect(() => fn()).toThrow("SESSION_SECRET is too short");
  });

  it("throws when DATABASE_URL is missing in production", async () => {
    process.env.NODE_ENV            = "production";
    process.env.JWT_SECRET          = "aB3cD4eF5gH6iJ7kL8mN9oP0qR1sT2uV";
    process.env.SESSION_SECRET      = "aB3cD4eF5gH6iJ7kL8mN9oP0qR1sT2uV";
    process.env.MD_PASSWORD         = "SecurePass1234!!";
    process.env.CLINICIAN_PASSWORD  = "ClinicPass1234!!";
    delete process.env.DATABASE_URL;
    delete process.env.DATABASE_URL_PRIMARY;
    const fn = await load();
    expect(() => fn()).toThrow("Missing required production config: DATABASE_URL");
  });

  it("throws when DATABASE_URL points to localhost in production", async () => {
    process.env.NODE_ENV            = "production";
    process.env.JWT_SECRET          = "aB3cD4eF5gH6iJ7kL8mN9oP0qR1sT2uV";
    process.env.SESSION_SECRET      = "aB3cD4eF5gH6iJ7kL8mN9oP0qR1sT2uV";
    process.env.MD_PASSWORD         = "SecurePass1234!!";
    process.env.CLINICIAN_PASSWORD  = "ClinicPass1234!!";
    process.env.DATABASE_URL        = "postgresql://user:pass@localhost/prod?sslmode=require";
    delete process.env.DATABASE_URL_PRIMARY;
    const fn = await load();
    expect(() => fn()).toThrow("DATABASE_URL points to localhost in production");
  });

  it("throws when DATABASE_URL has no SSL in production", async () => {
    process.env.NODE_ENV            = "production";
    process.env.JWT_SECRET          = "aB3cD4eF5gH6iJ7kL8mN9oP0qR1sT2uV";
    process.env.SESSION_SECRET      = "aB3cD4eF5gH6iJ7kL8mN9oP0qR1sT2uV";
    process.env.MD_PASSWORD         = "SecurePass1234!!";
    process.env.CLINICIAN_PASSWORD  = "ClinicPass1234!!";
    process.env.DATABASE_URL        = "postgresql://user:pass@db.prod.example.com/prod";
    delete process.env.DATABASE_URL_PRIMARY;
    const fn = await load();
    expect(() => fn()).toThrow("does not enforce SSL");
  });

  it("throws when no Redis is configured in production (no TCP and no Upstash)", async () => {
    process.env.NODE_ENV            = "production";
    process.env.JWT_SECRET          = "aB3cD4eF5gH6iJ7kL8mN9oP0qR1sT2uV";
    process.env.SESSION_SECRET      = "aB3cD4eF5gH6iJ7kL8mN9oP0qR1sT2uV";
    process.env.MD_PASSWORD         = "SecurePass1234!!";
    process.env.CLINICIAN_PASSWORD  = "ClinicPass1234!!";
    process.env.DATABASE_URL        = "postgresql://user:pass@db.prod.example.com/prod?sslmode=require";
    delete process.env.DATABASE_URL_PRIMARY;
    delete process.env.REDIS_URL;
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    const fn = await load();
    expect(() => fn()).toThrow("No Redis configured in production");
  });

  it("accepts Upstash REST as valid Redis in production (no REDIS_URL needed)", async () => {
    process.env.NODE_ENV            = "production";
    process.env.JWT_SECRET          = "aB3cD4eF5gH6iJ7kL8mN9oP0qR1sT2uV";
    process.env.SESSION_SECRET      = "aB3cD4eF5gH6iJ7kL8mN9oP0qR1sT2uV";
    process.env.MD_PASSWORD         = "SecurePass1234!!";
    process.env.CLINICIAN_PASSWORD  = "ClinicPass1234!!";
    process.env.DATABASE_URL        = "postgresql://user:pass@db.prod.example.com/prod?sslmode=require";
    delete process.env.DATABASE_URL_PRIMARY;
    delete process.env.REDIS_URL;
    process.env.UPSTASH_REDIS_REST_URL   = "https://upstash.example.com";
    process.env.UPSTASH_REDIS_REST_TOKEN = "sometoken";
    delete process.env.BYPASS_AUTH;
    delete process.env.DEMO_USERS;
    delete process.env.SKIP_SAFETY_GATES;
    delete process.env.DISABLE_AUDIT;
    delete process.env.DISABLE_RBAC;
    const fn = await load();
    expect(() => fn()).not.toThrow();
  });

  it("throws when REDIS_URL uses plain redis:// (no TLS) in production", async () => {
    process.env.NODE_ENV            = "production";
    process.env.JWT_SECRET          = "aB3cD4eF5gH6iJ7kL8mN9oP0qR1sT2uV";
    process.env.SESSION_SECRET      = "aB3cD4eF5gH6iJ7kL8mN9oP0qR1sT2uV";
    process.env.MD_PASSWORD         = "SecurePass1234!!";
    process.env.CLINICIAN_PASSWORD  = "ClinicPass1234!!";
    process.env.DATABASE_URL        = "postgresql://user:pass@db.prod.example.com/prod?sslmode=require";
    delete process.env.DATABASE_URL_PRIMARY;
    process.env.REDIS_URL           = "redis://cache.prod.example.com:6379";
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    const fn = await load();
    expect(() => fn()).toThrow("does not use TLS");
  });

  it("throws for each dangerous flag when active in production", async () => {
    const flags = ["BYPASS_AUTH", "DEMO_USERS", "SKIP_SAFETY_GATES", "DISABLE_AUDIT", "DISABLE_RBAC"];
    for (const flag of flags) {
      restoreEnv();
      vi.resetModules();
      process.env.NODE_ENV            = "production";
      process.env.JWT_SECRET          = "aB3cD4eF5gH6iJ7kL8mN9oP0qR1sT2uV";
      process.env.SESSION_SECRET      = "aB3cD4eF5gH6iJ7kL8mN9oP0qR1sT2uV";
      process.env.MD_PASSWORD         = "SecurePass1234!!";
      process.env.CLINICIAN_PASSWORD  = "ClinicPass1234!!";
      process.env.DATABASE_URL        = "postgresql://user:pass@db.prod.example.com/prod?sslmode=require";
      delete process.env.DATABASE_URL_PRIMARY;
      process.env.REDIS_URL           = "rediss://cache.prod.example.com:6380";
      delete process.env.UPSTASH_REDIS_REST_URL;
      delete process.env.UPSTASH_REDIS_REST_TOKEN;
      process.env[flag]               = "true";
      const fn = await load();
      expect(() => fn()).toThrow(flag);
    }
  });

  it("error message includes openssl hint for too-short secrets", async () => {
    process.env.NODE_ENV            = "production";
    process.env.JWT_SECRET          = "onlyfifteench!";              // 15 chars, not banned
    process.env.SESSION_SECRET      = "aB3cD4eF5gH6iJ7kL8mN9oP0qR1sT2uV";
    process.env.MD_PASSWORD         = "SecurePass1234!!";
    process.env.CLINICIAN_PASSWORD  = "ClinicPass1234!!";
    process.env.DATABASE_URL        = "postgresql://user:pass@db.prod.example.com/prod?sslmode=require";
    process.env.UPSTASH_REDIS_REST_URL   = "https://upstash.example.com";
    process.env.UPSTASH_REDIS_REST_TOKEN = "sometoken";
    delete process.env.REDIS_URL;
    const fn = await load();
    expect(() => fn()).toThrow("openssl rand");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Individual synchronous check functions — tested in isolation
// No DB or Redis I/O involved in these tests.
// ─────────────────────────────────────────────────────────────────────────────

describe("checkNodeVersion", () => {
  afterEach(() => {
    restoreEnv();
    vi.resetModules();
  });

  async function load() {
    vi.resetModules();
    const { checkNodeVersion } = await import("../../server/config/startupChecks");
    return checkNodeVersion;
  }

  it("passes on the current Node.js version (≥18)", async () => {
    const fn = await load();
    const result = fn();
    expect(result.ok).toBe(true);
    expect(result.name).toBe("NODE_VERSION");
    expect(result.fatal).toBe(false);
  });

  it("fails fatally when Node version is below 18", async () => {
    const fn = await load();
    const origVersion = process.versions.node;
    // Temporarily override versions.node
    Object.defineProperty(process.versions, "node", { value: "16.20.0", configurable: true });
    const result = fn();
    Object.defineProperty(process.versions, "node", { value: origVersion, configurable: true });
    expect(result.ok).toBe(false);
    expect(result.fatal).toBe(true);
    expect(result.detail).toMatch(/below minimum/);
  });
});

describe("checkJwtSecret", () => {
  afterEach(() => {
    restoreEnv();
    vi.resetModules();
  });

  async function load() {
    vi.resetModules();
    const { checkJwtSecret } = await import("../../server/config/startupChecks");
    return checkJwtSecret;
  }

  it("passes when JWT_SECRET is 32+ chars with sufficient variety", async () => {
    process.env.JWT_SECRET = "aB3cD4eF5gH6iJ7kL8mN9oP0qR1sT2uV";
    const fn = await load();
    const result = fn();
    expect(result.ok).toBe(true);
  });

  it("is non-fatal in dev when JWT_SECRET is absent", async () => {
    process.env.NODE_ENV = "development";
    delete process.env.JWT_SECRET;
    const fn = await load();
    const result = fn();
    expect(result.ok).toBe(false);
    expect(result.fatal).toBe(false);
    expect(result.detail).toMatch(/per-session random dev secret/);
  });

  it("is fatal in production when JWT_SECRET is absent", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.JWT_SECRET;
    const fn = await load();
    const result = fn();
    expect(result.ok).toBe(false);
    expect(result.fatal).toBe(true);
  });

  it("fails when JWT_SECRET has fewer than 8 unique characters", async () => {
    process.env.JWT_SECRET = "a".repeat(40);   // 40 chars, 1 unique
    const fn = await load();
    const result = fn();
    expect(result.ok).toBe(false);
    expect(result.detail).toMatch(/unique characters/);
  });

  it("fails when JWT_SECRET is shorter than 32 chars", async () => {
    process.env.JWT_SECRET = "tooshort12345";
    const fn = await load();
    const result = fn();
    expect(result.ok).toBe(false);
    expect(result.detail).toMatch(/minimum 32 required/);
  });
});

describe("checkSessionSecret", () => {
  afterEach(() => {
    restoreEnv();
    vi.resetModules();
  });

  async function load() {
    vi.resetModules();
    const { checkSessionSecret } = await import("../../server/config/startupChecks");
    return checkSessionSecret;
  }

  it("passes when SESSION_SECRET is 32+ chars", async () => {
    process.env.SESSION_SECRET = "aB3cD4eF5gH6iJ7kL8mN9oP0qR1sT2uV";
    const fn = await load();
    const result = fn();
    expect(result.ok).toBe(true);
  });

  it("fails when SESSION_SECRET is shorter than 32 chars", async () => {
    process.env.SESSION_SECRET = "dev-secret";   // 10 chars
    const fn = await load();
    const result = fn();
    expect(result.ok).toBe(false);
    expect(result.detail).toMatch(/minimum 32 required/);
  });

  it("is non-fatal in dev", async () => {
    process.env.NODE_ENV       = "development";
    process.env.SESSION_SECRET = "short";
    const fn = await load();
    const result = fn();
    expect(result.fatal).toBe(false);
  });

  it("is fatal in production", async () => {
    process.env.NODE_ENV       = "production";
    process.env.SESSION_SECRET = "short";
    const fn = await load();
    const result = fn();
    expect(result.fatal).toBe(true);
  });
});

describe("checkDatabaseUrl", () => {
  afterEach(() => {
    restoreEnv();
    vi.resetModules();
  });

  async function load() {
    vi.resetModules();
    const { checkDatabaseUrl } = await import("../../server/config/startupChecks");
    return checkDatabaseUrl;
  }

  it("fails fatally when DATABASE_URL is empty", async () => {
    delete process.env.DATABASE_URL;
    delete process.env.DATABASE_URL_PRIMARY;
    const fn = await load();
    const result = fn();
    expect(result.ok).toBe(false);
    expect(result.fatal).toBe(true);
    expect(result.detail).toMatch(/not set/i);
  });

  it("passes with localhost URL in development (no SSL check)", async () => {
    process.env.NODE_ENV     = "development";
    process.env.DATABASE_URL = "postgresql://user:pass@localhost/dev";
    delete process.env.DATABASE_URL_PRIMARY;
    const fn = await load();
    const result = fn();
    expect(result.ok).toBe(true);
  });

  it("fails fatally with localhost URL in production", async () => {
    process.env.NODE_ENV     = "production";
    process.env.DATABASE_URL = "postgresql://user:pass@localhost/prod?sslmode=require";
    delete process.env.DATABASE_URL_PRIMARY;
    const fn = await load();
    const result = fn();
    expect(result.ok).toBe(false);
    expect(result.fatal).toBe(true);
    expect(result.detail).toMatch(/localhost/);
  });

  it("fails fatally when DATABASE_URL has no SSL in production", async () => {
    process.env.NODE_ENV     = "production";
    process.env.DATABASE_URL = "postgresql://user:pass@db.prod.example.com/prod";
    delete process.env.DATABASE_URL_PRIMARY;
    const fn = await load();
    const result = fn();
    expect(result.ok).toBe(false);
    expect(result.fatal).toBe(true);
    expect(result.detail).toMatch(/SSL/);
  });

  it("passes with sslmode=require in production", async () => {
    process.env.NODE_ENV     = "production";
    process.env.DATABASE_URL = "postgresql://user:pass@db.prod.example.com/prod?sslmode=require";
    delete process.env.DATABASE_URL_PRIMARY;
    const fn = await load();
    const result = fn();
    expect(result.ok).toBe(true);
  });

  it("passes with ssl=true in production", async () => {
    process.env.NODE_ENV     = "production";
    process.env.DATABASE_URL = "postgresql://user:pass@db.prod.example.com/prod?ssl=true";
    delete process.env.DATABASE_URL_PRIMARY;
    const fn = await load();
    const result = fn();
    expect(result.ok).toBe(true);
  });
});

describe("checkDangerousFlags", () => {
  afterEach(() => {
    restoreEnv();
    vi.resetModules();
  });

  async function load() {
    vi.resetModules();
    const { checkDangerousFlags } = await import("../../server/config/startupChecks");
    return checkDangerousFlags;
  }

  it("is skipped (ok: true) in non-production environments", async () => {
    process.env.NODE_ENV  = "development";
    process.env.BYPASS_AUTH = "true";
    const fn = await load();
    const result = fn();
    expect(result.ok).toBe(true);
    expect(result.detail).toMatch(/skipped/i);
  });

  it("fails when BYPASS_AUTH is active in production", async () => {
    process.env.NODE_ENV    = "production";
    process.env.BYPASS_AUTH = "true";
    const fn = await load();
    const result = fn();
    expect(result.ok).toBe(false);
    expect(result.fatal).toBe(true);
    expect(result.detail).toMatch(/BYPASS_AUTH/);
  });

  it("fails when SKIP_SAFETY_GATES is active in production", async () => {
    process.env.NODE_ENV            = "production";
    delete process.env.BYPASS_AUTH;
    process.env.SKIP_SAFETY_GATES   = "true";
    const fn = await load();
    const result = fn();
    expect(result.ok).toBe(false);
    expect(result.detail).toMatch(/SKIP_SAFETY_GATES/);
  });

  it("passes when no dangerous flags are active in production", async () => {
    process.env.NODE_ENV = "production";
    ["DEMO_USERS", "BYPASS_AUTH", "SKIP_SAFETY_GATES", "DISABLE_AUDIT", "DISABLE_RBAC"]
      .forEach(f => delete process.env[f]);
    const fn = await load();
    const result = fn();
    expect(result.ok).toBe(true);
  });
});

describe("checkClockDrift", () => {
  async function load() {
    vi.resetModules();
    const { checkClockDrift } = await import("../../server/config/startupChecks");
    return checkClockDrift;
  }

  it("passes with the current real system time", async () => {
    const fn = await load();
    const result = await fn();
    expect(result.ok).toBe(true);
    expect(result.name).toBe("CLOCK_DRIFT");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// runStartupChecks — integration smoke test (uses real DB in dev env)
// ─────────────────────────────────────────────────────────────────────────────

describe("runStartupChecks — integration smoke (real dev DB)", () => {
  it("completes without throwing and returns properly shaped results", async () => {
    vi.resetModules();
    const { runStartupChecks } = await import("../../server/config/startupChecks");
    const results = await runStartupChecks();
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(typeof r.name).toBe("string");
      expect(typeof r.ok).toBe("boolean");
      expect(typeof r.detail).toBe("string");
      expect(typeof r.fatal).toBe("boolean");
    }
  });

  it("includes all required check names", async () => {
    vi.resetModules();
    const { runStartupChecks } = await import("../../server/config/startupChecks");
    const results = await runStartupChecks();
    const names = results.map(r => r.name);
    expect(names).toContain("NODE_VERSION");
    expect(names).toContain("JWT_SECRET");
    expect(names).toContain("SESSION_SECRET");
    expect(names).toContain("DATABASE_URL");
    expect(names).toContain("DANGEROUS_FLAGS");
    expect(names).toContain("CLOCK_DRIFT");
    expect(names).toContain("DATABASE_CONNECTIVITY");
    expect(names).toContain("REDIS_CONNECTIVITY");
    expect(names).toContain("DATABASE_SCHEMA_READY");
  });

  it("NODE_VERSION and CLOCK_DRIFT checks pass in dev env", async () => {
    vi.resetModules();
    const { runStartupChecks } = await import("../../server/config/startupChecks");
    const results = await runStartupChecks();
    const nodeCheck  = results.find(r => r.name === "NODE_VERSION");
    const clockCheck = results.find(r => r.name === "CLOCK_DRIFT");
    expect(nodeCheck!.ok).toBe(true);
    expect(clockCheck!.ok).toBe(true);
  });

  it("DATABASE_CONNECTIVITY and DATABASE_SCHEMA_READY pass in dev env", async () => {
    vi.resetModules();
    const { runStartupChecks } = await import("../../server/config/startupChecks");
    const results = await runStartupChecks();
    const dbConn   = results.find(r => r.name === "DATABASE_CONNECTIVITY");
    const dbSchema = results.find(r => r.name === "DATABASE_SCHEMA_READY");
    expect(dbConn!.ok).toBe(true);
    expect(dbSchema!.ok).toBe(true);
  });
});
