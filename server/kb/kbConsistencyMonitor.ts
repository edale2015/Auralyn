/**
 * KB Cross-Instance Consistency Monitor
 *
 * In a multi-instance deployment, KB version drift is a silent risk: one
 * instance serves patients with KB v1.4.2 while another uses v1.3.9, producing
 * different dispositions for identical presentations.
 *
 * This monitor:
 *   (a) Writes the current instance's KB version to Redis on every cache refresh
 *   (b) Reads other instances' published versions and alerts on drift
 *   (c) Uses polling (not pub/sub) — Upstash REST API does not support
 *       SUBSCRIBE; ioredis connections are avoided for cost and reliability.
 *
 * Drift detection runs every 60 seconds by default. In production, drift
 * events should trigger an alert to the ops team, as they mean clinically
 * inconsistent responses are being served.
 */

import { getRedisAsync } from "../queue/redis";
import { getKbCache }    from "./kbRuntime";

const INSTANCE_ID   = process.env.INSTANCE_ID ?? `instance-${Math.random().toString(36).slice(2, 8)}`;
const VERSION_KEY   = "kb:version:instances";   // Redis hash: instanceId → version:ts
const VERSION_TTL   = 300;                       // 5 min — instance considered stale after this

// ── Version broadcast ─────────────────────────────────────────────────────────

/**
 * Publish this instance's current KB version to Redis.
 * Should be called after every KB cache refresh.
 */
export async function broadcastKbVersion(): Promise<void> {
  try {
    const redis = await getRedisAsync();
    if (!redis || typeof redis.hset !== "function") return;

    const kb      = getKbCache();
    const version = (kb as any).version ?? "unknown";

    // Write instanceId → JSON(version, ts, instanceId) into a hash
    await redis.hset(VERSION_KEY, INSTANCE_ID, JSON.stringify({
      instanceId: INSTANCE_ID,
      version,
      ts: Date.now(),
    }));

    // Expire the whole hash entry for this instance after TTL
    // (individual field expiry requires Redis 7.4+; use EXPIRE on a per-key approach)
    await redis.expire?.(VERSION_KEY, VERSION_TTL * 10);   // hash itself lives 50 min

  } catch (err) {
    console.warn("[KbConsistencyMonitor] broadcastKbVersion failed:", err instanceof Error ? err.message : String(err));
  }
}

// ── Version listener (polling) ────────────────────────────────────────────────

export interface KbVersionEntry {
  instanceId: string;
  version:    string;
  ts:         number;
  stale:      boolean;
}

export interface KbDriftReport {
  localVersion:   string;
  allInstances:   KbVersionEntry[];
  driftDetected:  boolean;
  driftInstances: string[];   // instance IDs that differ from local
  staleInstances: string[];   // instance IDs with stale heartbeats
}

/**
 * Poll Redis for all known instance versions and compare to local.
 * Returns a drift report — caller decides what to alert on.
 */
export async function checkKbDrift(): Promise<KbDriftReport> {
  const kb           = getKbCache();
  const localVersion = (kb as any).version ?? "unknown";
  const now          = Date.now();

  const fallback: KbDriftReport = {
    localVersion,
    allInstances:   [],
    driftDetected:  false,
    driftInstances: [],
    staleInstances: [],
  };

  try {
    const redis = await getRedisAsync();
    if (!redis || typeof redis.hgetall !== "function") return fallback;

    const raw = await redis.hgetall(VERSION_KEY);
    if (!raw) return fallback;

    const allInstances: KbVersionEntry[] = Object.values(raw).map(v => {
      try {
        const parsed = JSON.parse(v as string);
        return {
          instanceId: parsed.instanceId,
          version:    parsed.version,
          ts:         parsed.ts,
          stale:      now - parsed.ts > VERSION_TTL * 1000,
        };
      } catch {
        return { instanceId: "unknown", version: "unknown", ts: 0, stale: true };
      }
    });

    const driftInstances = allInstances
      .filter(i => !i.stale && i.instanceId !== INSTANCE_ID && i.version !== localVersion)
      .map(i => i.instanceId);

    const staleInstances = allInstances
      .filter(i => i.stale)
      .map(i => i.instanceId);

    const driftDetected = driftInstances.length > 0;

    if (driftDetected) {
      console.error(
        `[KB DRIFT DETECTED] Local version: ${localVersion}. ` +
        `Drifted instances: ${driftInstances.join(", ")}`
      );
    }

    return { localVersion, allInstances, driftDetected, driftInstances, staleInstances };

  } catch (err) {
    console.warn("[KbConsistencyMonitor] checkKbDrift failed:", err instanceof Error ? err.message : String(err));
    return fallback;
  }
}

// ── Polling loop ──────────────────────────────────────────────────────────────

let _pollInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Start the KB consistency polling loop.
 * Broadcasts this instance's version and checks for drift every intervalMs.
 */
export function startKbConsistencyMonitor(intervalMs = 60_000): void {
  if (_pollInterval) return;   // already running

  _pollInterval = setInterval(async () => {
    await broadcastKbVersion();
    const report = await checkKbDrift();
    if (report.driftDetected) {
      console.error(
        `[KbConsistencyMonitor] ⚠ KB version drift — ${report.driftInstances.length} instance(s) differ. ` +
        `Local: ${report.localVersion}`
      );
    }
  }, intervalMs);

  // Unref so the loop doesn't keep the process alive in test environments
  _pollInterval.unref?.();

  console.log(`[KbConsistencyMonitor] Started — polling every ${intervalMs / 1000}s (instance: ${INSTANCE_ID})`);
}

/** Stop the polling loop (useful in tests). */
export function stopKbConsistencyMonitor(): void {
  if (_pollInterval) {
    clearInterval(_pollInterval);
    _pollInterval = null;
  }
}
