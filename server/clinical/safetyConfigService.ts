import { db } from "../db";
import { safetyConfigs } from "../../shared/schema";
import { eq, desc } from "drizzle-orm";
import type { SafetyGateConfig } from "./safetyGate";
import { DEFAULT_SAFETY_CONFIG } from "./safetyGate";

// ── safetyConfigService ───────────────────────────────────────────────────────
//
// Loads safety gate thresholds from the safety_configs table.
//
// This converts "please don't edit thresholds casually" (a code comment) into
// something with actual enforcement: a versioned DB record that requires
// approved_by, approval_note, and activation — auditable under FDA 21 CFR Part 11.
//
// Usage in production callers:
//   const config = await getActiveSafetyConfig();
//   const result = clinicalSafetyGate(input, config);
//
// The function falls back to DEFAULT_SAFETY_CONFIG if no active record exists,
// with a loud warning, so the gate continues to function during initial deploys
// before the first config record is seeded. This is intentionally NOT a hard
// failure — a complete inability to run the gate is worse than using known-safe
// defaults with a logged warning.

function toFloat(value: unknown, field: string): number {
  const n = typeof value === "string" ? parseFloat(value) : Number(value);
  if (!Number.isFinite(n)) {
    throw new Error(`safetyConfigService: invalid numeric value for field "${field}": ${value}`);
  }
  return n;
}

let _cachedConfig: SafetyGateConfig | null = null;
let _cacheExpiresAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes — short enough to pick up changes without a restart

/**
 * Returns the currently active safety gate configuration from the DB.
 *
 * Caches the result for 5 minutes to avoid a DB round-trip on every clinical
 * decision. Cache is invalidated when activateSafetyConfig() is called.
 *
 * Falls back to DEFAULT_SAFETY_CONFIG with a console warning if no active
 * config exists in the DB (e.g. fresh deployment, test env).
 */
export async function getActiveSafetyConfig(): Promise<SafetyGateConfig> {
  const now = Date.now();
  if (_cachedConfig && now < _cacheExpiresAt) {
    return _cachedConfig;
  }

  let rows: typeof safetyConfigs.$inferSelect[] = [];
  try {
    rows = await db
      .select()
      .from(safetyConfigs)
      .where(eq(safetyConfigs.isActive, true))
      .orderBy(desc(safetyConfigs.createdAt))
      .limit(1);
  } catch (err) {
    console.error("[SafetyConfigService] DB error loading active config:", err);
  }

  if (!rows.length) {
    console.warn(
      "[SafetyConfigService] WARNING: No active safety configuration found in DB. " +
      "Using DEFAULT_SAFETY_CONFIG. Seed a safety_configs row and set is_active=true."
    );
    return DEFAULT_SAFETY_CONFIG;
  }

  const row = rows[0];
  const config: SafetyGateConfig = {
    riskThreshold:        toFloat(row.riskThreshold,        "risk_threshold"),
    hardStopThreshold:    toFloat(row.hardStopThreshold,    "hard_stop_threshold"),
    uncertaintyThreshold: toFloat(row.uncertaintyThreshold, "uncertainty_threshold"),
    configVersion:        row.version,
  };

  _cachedConfig    = config;
  _cacheExpiresAt  = now + CACHE_TTL_MS;
  return config;
}

/** Invalidate the in-process config cache (call after activating a new config). */
export function invalidateSafetyConfigCache(): void {
  _cachedConfig   = null;
  _cacheExpiresAt = 0;
}
