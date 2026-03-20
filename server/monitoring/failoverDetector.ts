import { emitEvent } from "../controlTower/eventBus";
import { dbHealthCheck } from "../db/dbRouter";
import { isUsingFallback } from "../redis/redisClient";

export type RegionStatus = "PRIMARY_OK" | "PRIMARY_DOWN" | "SECONDARY_OK" | "DEGRADED";

let lastStatus: RegionStatus = "PRIMARY_OK";
let lastCheckAt = 0;
const CHECK_COOLDOWN_MS = 30_000;

export async function detectRegionFailure(): Promise<RegionStatus> {
  const now = Date.now();
  if (now - lastCheckAt < CHECK_COOLDOWN_MS) return lastStatus;
  lastCheckAt = now;

  const primaryUrl = process.env.PRIMARY_API_URL;
  let primaryOk = true;
  let primaryLatencyMs = 0;

  if (primaryUrl) {
    const t = Date.now();
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 4000);
      const res = await fetch(`${primaryUrl}/api/healthz`, { signal: ctrl.signal });
      clearTimeout(timer);
      primaryOk = res.ok;
      primaryLatencyMs = Date.now() - t;
    } catch {
      primaryOk = false;
      primaryLatencyMs = Date.now() - t;
    }
  }

  const dbHealth = await dbHealthCheck();
  const redisFallback = isUsingFallback();

  let status: RegionStatus;
  if (!primaryOk && primaryUrl) {
    status = "PRIMARY_DOWN";
  } else if (!dbHealth.ok || redisFallback) {
    status = "DEGRADED";
  } else {
    status = "PRIMARY_OK";
  }

  if (status !== lastStatus) {
    console.warn(`[FailoverDetector] Region status changed: ${lastStatus} → ${status}`);
  }
  lastStatus = status;

  emitEvent({
    type: "REGION_STATUS",
    payload: {
      status,
      primary: primaryOk ? "UP" : primaryUrl ? "DOWN" : "NOT_CONFIGURED",
      secondary: process.env.SECONDARY_API_URL ? "STANDBY" : "NOT_CONFIGURED",
      db: dbHealth.ok ? "UP" : "DOWN",
      dbLatencyMs: dbHealth.latencyMs,
      redis: redisFallback ? "SECONDARY_ACTIVE" : "PRIMARY_ACTIVE",
      replicaEnabled: dbHealth.replica,
      checkedAt: new Date().toISOString(),
    },
    timestamp: now,
  });

  return status;
}

export function getLastRegionStatus(): { status: RegionStatus; checkedAt: string | null } {
  return {
    status: lastStatus,
    checkedAt: lastCheckAt > 0 ? new Date(lastCheckAt).toISOString() : null,
  };
}

export async function runFailoverLoop(intervalMs = 60_000): Promise<void> {
  const run = async () => {
    await detectRegionFailure().catch((e: any) =>
      console.error("[FailoverDetector] Check failed:", e?.message)
    );
  };
  await run();
  setInterval(run, intervalMs).unref();
}
