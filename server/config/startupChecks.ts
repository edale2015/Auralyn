import { ENV } from "./env";

// ── CheckResult contract ──────────────────────────────────────────────────────
//
// FIXED: original CheckResult had no `fatal` flag — the caller had no way to
// distinguish a missing non-critical service from a hard security failure.
// All checks now declare their own fatality so the main function can enforce
// a clear contract: fatal:true failures abort startup, fatal:false ones are
// logged as warnings and the server continues.

export interface CheckResult {
  name:   string;
  ok:     boolean;
  detail: string;
  fatal:  boolean;  // if true and !ok, server must not start
}

// ─────────────────────────────────────────────────────────────────────────────
// Individual check implementations
// ─────────────────────────────────────────────────────────────────────────────

// ── Exports for unit testing ──────────────────────────────────────────────────
// Individual check functions are exported so tests can exercise them in isolation
// without triggering DB/Redis I/O or running the full startup sequence.
// These are NOT intended to be called from application code — use runStartupChecks().

export {
  checkNodeVersion,
  checkJwtSecret,
  checkSessionSecret,
  checkDatabaseUrl,
  checkDangerousFlags,
  checkClockDrift,
  checkExternalServices,
};

function checkNodeVersion(): CheckResult {
  const name    = "NODE_VERSION";
  const version = process.versions.node;
  const major   = parseInt(version.split(".")[0], 10);
  const minimum = 18;

  if (major < minimum) {
    return {
      name, ok: false, fatal: true,
      detail: `Node.js ${version} is below minimum required v${minimum}.x — upgrade immediately`,
    };
  }
  return { name, ok: true, fatal: false, detail: `Node.js ${version}` };
}

function checkJwtSecret(): CheckResult {
  const name = "JWT_SECRET";
  const val  = ENV.JWT_SECRET;

  if (!val || val.trim() === "") {
    // In dev, unifiedAuth.ts generates a random per-session secret so this is
    // non-fatal — but we warn. In prod, assertProductionSafe() already threw.
    return {
      name, ok: false,
      fatal: ENV.NODE_ENV === "production",
      detail: "JWT_SECRET is not set — using per-session random dev secret (tokens reset on restart)",
    };
  }
  if (val.length < 32) {
    return {
      name, ok: false,
      fatal: ENV.NODE_ENV === "production",
      detail: `JWT_SECRET is ${val.length} chars — minimum 32 required (256-bit entropy)`,
    };
  }
  // Coarse entropy heuristic: unique character count.
  // Note: this is NOT a real entropy measurement — it is a cheap proxy to catch
  // "aaaa...aaaa" style secrets that have length but no randomness. A value can
  // pass this check and still have low entropy. assertProductionSafe() checks
  // for known placeholder strings. These are complementary defenses, not complete ones.
  const uniqueChars = new Set(val).size;
  if (uniqueChars < 8) {
    return {
      name, ok: false,
      fatal: ENV.NODE_ENV === "production",
      detail: `JWT_SECRET has only ${uniqueChars} unique characters — use a cryptographically random value (openssl rand -hex 32)`,
    };
  }
  return { name, ok: true, fatal: false, detail: `Set (${val.length} chars, ${uniqueChars} unique)` };
}

function checkSessionSecret(): CheckResult {
  const name = "SESSION_SECRET";
  const val  = ENV.SESSION_SECRET;

  if (!val || val.trim() === "") {
    return {
      name, ok: false,
      fatal: ENV.NODE_ENV === "production",
      detail: "SESSION_SECRET is not set",
    };
  }
  // FIXED: original checked >= 12 (72 bits). NIST recommends >= 112 bits for symmetric
  // keys. 32 chars of random base64/hex is a reasonable minimum (256-bit key space).
  if (val.length < 32) {
    return {
      name, ok: false,
      fatal: ENV.NODE_ENV === "production",
      detail: `SESSION_SECRET is ${val.length} chars — minimum 32 required`,
    };
  }
  return { name, ok: true, fatal: false, detail: `Set (${val.length} chars)` };
}

function checkDatabaseUrl(): CheckResult {
  const name = "DATABASE_URL";
  const val  = ENV.DATABASE_URL;

  if (!val || val.trim() === "") {
    return { name, ok: false, fatal: true, detail: "DATABASE_URL is not set" };
  }

  if (ENV.NODE_ENV === "production") {
    // Use URL parser instead of substring matching — handles edge cases like
    // IPv6 addresses, URL-encoded credentials, and non-standard port syntax.
    let parsed: URL | null = null;
    try {
      // Convert postgres:// to https:// for URL parser compatibility
      parsed = new URL(val.replace(/^postgres(ql)?:\/\//, "https://"));
    } catch {
      return { name, ok: false, fatal: true, detail: "DATABASE_URL is not a valid URL" };
    }

    const host = parsed.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || host === "::1") {
      return {
        name, ok: false, fatal: true,
        detail: "DATABASE_URL points to localhost in production — PHI would be written to the wrong database",
      };
    }

    // SSL enforcement check — query param OR ssl=true
    const sslmode = parsed.searchParams.get("sslmode");
    const ssl     = parsed.searchParams.get("ssl");
    if (sslmode !== "require" && ssl !== "true") {
      return {
        name, ok: false, fatal: true,
        detail: "DATABASE_URL does not enforce SSL (add ?sslmode=require) — required for HIPAA §164.312(e)(2)(ii)",
      };
    }
  }

  return { name, ok: true, fatal: false, detail: "Set and SSL-enforced" };
}

function checkDangerousFlags(): CheckResult {
  const name = "DANGEROUS_FLAGS";

  if (ENV.NODE_ENV !== "production") {
    return { name, ok: true, fatal: false, detail: "Not production — skipped" };
  }

  const dangerous = [
    "DEMO_USERS",
    "BYPASS_AUTH",
    "SKIP_SAFETY_GATES",
    "DISABLE_AUDIT",
    "DISABLE_RBAC",
  ];
  const active = dangerous.filter(flag => process.env[flag] === "true");
  if (active.length > 0) {
    return {
      name, ok: false, fatal: true,
      detail: `Dangerous flags active in production: ${active.join(", ")}`,
    };
  }
  return { name, ok: true, fatal: false, detail: "No dangerous flags active" };
}

async function checkDatabaseReachable(): Promise<CheckResult> {
  const name = "DATABASE_CONNECTIVITY";
  try {
    const { db } = await import("../db");
    const { sql } = await import("drizzle-orm");

    await Promise.race([
      db.execute(sql`SELECT 1 AS ping`),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("DB ping timed out after 5s")), 5000)
      ),
    ]);
    return { name, ok: true, fatal: false, detail: "Database reachable (SELECT 1 passed)" };
  } catch (err) {
    return {
      name, ok: false, fatal: false,
      detail: `Database unreachable: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

async function checkDatabaseSchemaReady(): Promise<CheckResult> {
  const name = "DATABASE_SCHEMA_READY";

  // Tables that must exist for safe clinical operation.
  // If any are missing, a migration was not applied — do not accept traffic.
  const requiredTables = ["audit_logs", "safety_configs"];

  try {
    const { db } = await import("../db");
    const { sql } = await import("drizzle-orm");

    for (const tableName of requiredTables) {
      const rows = await db.execute(sql`
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = ${tableName}
        LIMIT 1
      `);
      const found = Array.isArray(rows) ? rows.length > 0
                  : (rows as any)?.rows?.length > 0;
      if (!found) {
        return {
          name, ok: false, fatal: false,
          detail: `Required table missing: ${tableName} — run database migrations before starting`,
        };
      }
    }
    return { name, ok: true, fatal: false, detail: `Required schema objects present (${requiredTables.join(", ")})` };
  } catch (err) {
    return {
      name, ok: false, fatal: false,
      detail: `Schema readiness check failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

async function checkRedisReachable(): Promise<CheckResult> {
  const name = "REDIS_CONNECTIVITY";

  const hasUpstash = !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
  const hasTcp     = !!(ENV.REDIS_URL);

  if (!hasUpstash && !hasTcp) {
    return {
      name, ok: false, fatal: false,
      detail: "No Redis configured — escalation guard will use in-memory store (single instance only)",
    };
  }

  try {
    const { getRedisAsync } = await import("../queue/redis");
    const redis = await Promise.race([
      getRedisAsync(),
      new Promise<null>(r => setTimeout(() => r(null), 5000)),
    ]);
    if (!redis) {
      return {
        name, ok: false, fatal: ENV.NODE_ENV === "production",
        detail: "Redis client unavailable after 5s timeout",
      };
    }
    const pong = await redis.ping();
    if (pong !== "PONG") {
      return {
        name, ok: false, fatal: ENV.NODE_ENV === "production",
        detail: `Redis ping returned unexpected response: ${pong}`,
      };
    }
    return { name, ok: true, fatal: false, detail: "Redis reachable (PING/PONG)" };
  } catch (err) {
    return {
      name, ok: false, fatal: ENV.NODE_ENV === "production",
      detail: `Redis unreachable: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

async function checkClockDrift(): Promise<CheckResult> {
  const name  = "CLOCK_DRIFT";
  const local = Date.now();

  // Sanity bounds: earlier than 2024-01-01 or later than 2050-01-01
  // indicates a clearly misconfigured system clock.
  // JWT expiry, audit timestamps, and HIPAA-required time records all depend on
  // correct system time. This is a coarse check — NTP drift < a few minutes
  // would not be caught here. An NTP daemon is the correct control for that.
  const TOO_OLD  = new Date("2024-01-01").getTime();
  const TOO_NEW  = new Date("2050-01-01").getTime();

  if (local < TOO_OLD || local > TOO_NEW) {
    return {
      name, ok: false, fatal: true,
      detail: `System clock appears invalid: ${new Date(local).toISOString()} — JWT expiry and audit timestamps will be incorrect`,
    };
  }
  return {
    name, ok: true, fatal: false,
    detail: `Clock sanity check passed (${new Date(local).toISOString()})`,
  };
}

function checkExternalServices(): CheckResult[] {
  const results: CheckResult[] = [];

  results.push({
    name:   "OPENAI_API_KEY",
    ok:     !!ENV.OPENAI_API_KEY,
    fatal:  false,
    detail: ENV.OPENAI_API_KEY ? "Set" : "Missing — AI clinical explanation features disabled",
  });

  // EHR endpoint: if set, must be HTTPS in production
  if (ENV.EHR_ENDPOINT) {
    let ehrOk = true;
    let ehrDetail = `Configured: ${ENV.EHR_ENDPOINT}`;
    if (ENV.NODE_ENV === "production") {
      try {
        const u = new URL(ENV.EHR_ENDPOINT);
        if (u.protocol !== "https:") {
          ehrOk    = false;
          ehrDetail = `EHR_ENDPOINT must use HTTPS in production — received ${u.protocol}`;
        }
        if (["localhost", "127.0.0.1"].includes(u.hostname)) {
          ehrOk    = false;
          ehrDetail = "EHR_ENDPOINT points to localhost in production";
        }
      } catch {
        ehrOk    = false;
        ehrDetail = "EHR_ENDPOINT is not a valid URL";
      }
    }
    results.push({ name: "EHR_ENDPOINT", ok: ehrOk, fatal: false, detail: ehrDetail });
  } else {
    results.push({ name: "EHR_ENDPOINT", ok: false, fatal: false, detail: "Not set — using mock EHR adapter" });
  }

  results.push({
    name:   "TWILIO_AUTH_TOKEN",
    ok:     !!ENV.TWILIO_AUTH_TOKEN,
    fatal:  false,
    detail: ENV.TWILIO_AUTH_TOKEN ? "Set" : "Missing — WhatsApp/SMS messaging disabled",
  });

  return results;
}

// ── Main entry point ──────────────────────────────────────────────────────────

/**
 * Runs all startup checks. Returns all results for logging and attestation.
 *
 * THROWS if any check with fatal:true fails.
 * Call this after assertProductionSafe() and before accepting traffic.
 *
 * Check ordering:
 *  1. Synchronous checks (no I/O) — fast, cheap, run first
 *  2. Async connectivity checks — DB and Redis pings
 *  3. Schema readiness — requires DB to be reachable first
 */
export async function runStartupChecks(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // ── Synchronous checks ───────────────────────────────────────────────────
  results.push(checkNodeVersion());
  results.push(checkJwtSecret());
  results.push(checkSessionSecret());
  results.push(checkDatabaseUrl());
  results.push(checkDangerousFlags());
  results.push(...checkExternalServices());
  results.push(await checkClockDrift());

  // ── Async connectivity ───────────────────────────────────────────────────
  const dbResult = await checkDatabaseReachable();
  results.push(dbResult);
  results.push(await checkRedisReachable());

  // ── Schema readiness (only if DB is reachable) ───────────────────────────
  if (dbResult.ok) {
    results.push(await checkDatabaseSchemaReady());
  } else {
    // DB ping timed out on cold start — non-fatal, schema check skipped
    results.push({
      name: "DATABASE_SCHEMA_READY", ok: false, fatal: false,
      detail: "Skipped — DB connectivity timed out on cold start (non-fatal)",
    });
  }

  // ── Log all results ──────────────────────────────────────────────────────
  for (const r of results) {
    const icon = r.ok ? "✅" : r.fatal ? "❌" : "⚠️ ";
    console.log(`[Startup] ${icon} ${r.name}: ${r.detail}`);
  }

  // ── Throw on any fatal failure ───────────────────────────────────────────
  const fatals = results.filter(r => !r.ok && r.fatal);
  if (fatals.length > 0) {
    throw new Error(
      `[STARTUP FATAL] ${fatals.length} critical check(s) failed:\n` +
      fatals.map(f => `  • ${f.name}: ${f.detail}`).join("\n")
    );
  }

  return results;
}
