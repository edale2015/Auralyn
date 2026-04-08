/**
 * engineTelemetry.ts
 * Streams per-engine execution telemetry to Redis (Upstash REST or ioredis).
 *
 * Each engine call records: success, durationMs, error (if any), timestamp.
 * The last 100 entries per engine are retained (circular buffer via LTRIM).
 *
 * API consumers read from GET /api/control/engine-health, which calls
 * getEngineTelemetry() to return all engines' recent run histories.
 *
 * Falls back gracefully when Redis is unavailable — telemetry is best-effort,
 * never on the critical path.
 */

import { getRedisAsync } from "../queue/redis";

const KEY_PREFIX = "engine:telemetry";
const MAX_ENTRIES = 100;

export interface EngineTelemetryEntry {
  success:    boolean;
  durationMs: number;
  error?:     string;
  timedOut?:  boolean;
  timestamp:  number;
}

/**
 * Log a single engine run result.
 * Non-blocking: called inside withTimeout(), never awaited on critical path.
 */
export async function logEngineTelemetry(
  engineName: string,
  entry:      Omit<EngineTelemetryEntry, "timestamp">,
): Promise<void> {
  try {
    const redis = await getRedisAsync();
    if (!redis) return;

    const key     = `${KEY_PREFIX}:${engineName}`;
    const payload = JSON.stringify({ ...entry, timestamp: Date.now() });

    if (typeof redis.lpush === "function") {
      await redis.lpush(key, payload);
      await redis.ltrim(key, 0, MAX_ENTRIES - 1);
    }
  } catch {
    // Telemetry failure must never surface to callers.
  }
}

/**
 * Returns recent telemetry for all tracked engines.
 * Callers should cache this — it scans all engine keys.
 */
export async function getEngineTelemetry(): Promise<Record<string, EngineTelemetryEntry[]>> {
  try {
    const redis = await getRedisAsync();
    if (!redis) return {};

    let keys: string[] = [];

    if (typeof redis.keys === "function") {
      keys = await redis.keys(`${KEY_PREFIX}:*`);
    }

    const result: Record<string, EngineTelemetryEntry[]> = {};

    for (const key of keys) {
      const parts      = key.split(":");
      const engineName = parts[parts.length - 1];
      let raw: string[] = [];
      if (typeof redis.lrange === "function") {
        raw = await redis.lrange(key, 0, 19);
      }
      result[engineName] = raw
        .map((r) => { try { return JSON.parse(r); } catch { return null; } })
        .filter(Boolean) as EngineTelemetryEntry[];
    }

    return result;
  } catch {
    return {};
  }
}

/**
 * Computes a health summary for a single engine from its recent telemetry.
 */
export function summariseEngineTelemetry(entries: EngineTelemetryEntry[]): {
  successRate:   number;
  timeoutRate:   number;
  avgDurationMs: number;
  recentFailures: number;
} {
  if (!entries.length) {
    return { successRate: 1, timeoutRate: 0, avgDurationMs: 0, recentFailures: 0 };
  }

  const successCount  = entries.filter((e) => e.success).length;
  const timeoutCount  = entries.filter((e) => e.timedOut).length;
  const totalDuration = entries.reduce((sum, e) => sum + (e.durationMs ?? 0), 0);
  const recentFailures = entries.slice(0, 5).filter((e) => !e.success).length;

  return {
    successRate:    successCount  / entries.length,
    timeoutRate:    timeoutCount  / entries.length,
    avgDurationMs:  totalDuration / entries.length,
    recentFailures,
  };
}
