import { getKbVersion, getKbCacheStatus } from "../kb/kbRuntime";

// Startup invariant checks — called during server boot before any routes are registered.
// A failed invariant throws immediately so the process crashes visibly rather than
// serving requests with a broken configuration.
export function assertClinicalStartupInvariants(): void {
  const problems: string[] = [];

  if (typeof getKbVersion !== "function") {
    problems.push("kbRuntime.getKbVersion is missing — KB cache versioning will not work");
  }

  if (typeof getKbCacheStatus !== "function") {
    problems.push("kbRuntime.getKbCacheStatus is missing — KB health monitoring will not work");
  }

  if (!process.env.APP_JWT_SECRET && process.env.NODE_ENV === "production") {
    problems.push("APP_JWT_SECRET missing in production — auth tokens are not secure");
  }

  if (process.env.NODE_ENV === "production") {
    if (!process.env.REDIS_URL) {
      problems.push("REDIS_URL missing in production — caching and rate-limiting will fail");
    }
    if (!process.env.AUDIT_HMAC_SECRET) {
      problems.push("AUDIT_HMAC_SECRET missing in production — audit records are not tamper-evident");
    }
    if (!process.env.DATABASE_URL) {
      problems.push("DATABASE_URL missing in production — no database connection");
    }
  }

  if (problems.length > 0) {
    const msg = `[StartupAssertions] Invariant failure (${problems.length} issue${problems.length > 1 ? "s" : ""}):\n  - ${problems.join("\n  - ")}`;
    if (process.env.NODE_ENV === "production") {
      throw new Error(msg);
    } else {
      console.warn(msg);
    }
  } else {
    console.info("[StartupAssertions] All clinical startup invariants passed");
  }
}
