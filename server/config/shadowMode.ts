export type ShadowModeConfig = {
  enabled: boolean;
  allowExportAfterSignoffOnly: boolean;
  autoCloseAfterExport: boolean;
  requirePhysicianSignoffForAllCases: boolean;
  logEveryEngineRun: boolean;
  logEveryDiscrepancy: boolean;
  allowedSourceChannels: string[];
  notes: string[];
};

const REDIS_KEY = "shadow-mode:config";

export const shadowModeConfig: ShadowModeConfig = {
  enabled: (process.env.SHADOW_MODE_ENABLED ?? "true").toLowerCase() === "true",
  allowExportAfterSignoffOnly: true,
  autoCloseAfterExport: false,
  requirePhysicianSignoffForAllCases: true,
  logEveryEngineRun: true,
  logEveryDiscrepancy: true,
  allowedSourceChannels: ["telegram", "web_chat", "internal_dashboard", "unknown"],
  notes: [
    "Shadow mode means the engine can recommend but not autonomously finalize care.",
    "All clinical actions remain physician-reviewed.",
    "Export bundles are sidecar outputs, not direct chart writeback."
  ]
};

/** Persist current config to Redis (fire-and-forget) */
export async function persistShadowModeToRedis(): Promise<void> {
  try {
    const { getRedisAsync } = await import("../queue/redis");
    const redis = await getRedisAsync();
    if (redis) await redis.set(REDIS_KEY, JSON.stringify(shadowModeConfig));
  } catch { /* non-fatal */ }
}

/** On startup: load persisted config from Redis and override defaults */
export async function initShadowModeFromRedis(): Promise<void> {
  try {
    const { getRedisAsync } = await import("../queue/redis");
    const redis = await getRedisAsync();
    if (!redis) return;
    const raw = await redis.get(REDIS_KEY);
    if (!raw) return;
    const saved: Partial<ShadowModeConfig> = typeof raw === "string" ? JSON.parse(raw) : raw;
    Object.assign(shadowModeConfig, saved);
    console.log("[ShadowMode] Config restored from Redis");
  } catch (e: any) {
    console.warn("[ShadowMode] Could not load config from Redis:", e?.message);
  }
}

export function assertShadowModeEnabled() {
  if (!shadowModeConfig.enabled) {
    throw new Error("Shadow mode is disabled");
  }
}
