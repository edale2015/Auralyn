/**
 * Global Automation Routing Strategy — Packet 20
 *
 * Routes automation job executions to the nearest or fastest worker region.
 * In Replit dev this runs locally; production deployments can swap to
 * Fly.io edge nodes or AWS ECS by swapping the REGION_ENDPOINTS map.
 *
 * Usage:
 *   const region  = await pickWorkerRegion();
 *   const baseUrl = getRegionEndpoint(region);
 *   // → POST ${baseUrl}/api/automation/run
 */

export type WorkerRegion = "dev" | "us-east" | "eu-west" | "asia-pacific";

export interface RegionEntry {
  region:    WorkerRegion;
  endpoint:  string;
  latencyMs: number | null;   // null = unprobed yet
}

// ── Region registry ───────────────────────────────────────────────────────────
// Endpoints are read from env vars so they're switchable per deployment.

const REGION_ENDPOINTS: Record<WorkerRegion, string> = {
  "dev":          process.env.WORKER_DEV_URL          ?? "http://localhost:5000",
  "us-east":      process.env.WORKER_US_EAST_URL      ?? "https://auralyn-us.fly.dev",
  "eu-west":      process.env.WORKER_EU_WEST_URL      ?? "https://auralyn-eu.fly.dev",
  "asia-pacific": process.env.WORKER_ASIA_URL         ?? "https://auralyn-asia.fly.dev",
};

export function getRegionEndpoint(region: WorkerRegion): string {
  return REGION_ENDPOINTS[region] ?? REGION_ENDPOINTS["dev"];
}

export function listRegions(): WorkerRegion[] {
  return Object.keys(REGION_ENDPOINTS) as WorkerRegion[];
}

// ── Latency probe ─────────────────────────────────────────────────────────────

const _latencyCache: Partial<Record<WorkerRegion, { ms: number; probedAt: number }>> = {};
const CACHE_TTL_MS = 60_000;   // re-probe every 60 s

async function probeLatency(region: WorkerRegion): Promise<number> {
  const cached = _latencyCache[region];
  if (cached && Date.now() - cached.probedAt < CACHE_TTL_MS) return cached.ms;

  const endpoint = getRegionEndpoint(region);
  const start    = Date.now();

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2_500);
    await fetch(`${endpoint}/api/automation/metrics`, { signal: ctrl.signal });
    clearTimeout(timer);
  } catch {
    // unreachable or timed out → assign high penalty
    _latencyCache[region] = { ms: 9_999, probedAt: Date.now() };
    return 9_999;
  }

  const ms = Date.now() - start;
  _latencyCache[region] = { ms, probedAt: Date.now() };
  return ms;
}

// ── Smart region picker ───────────────────────────────────────────────────────

/**
 * Probes all regions in parallel, returns the one with lowest latency.
 * Falls back to "dev" if all probes fail.
 */
export async function pickWorkerRegion(): Promise<WorkerRegion> {
  const regions = listRegions();
  const results = await Promise.all(
    regions.map(async (r) => ({ region: r, ms: await probeLatency(r) }))
  );
  results.sort((a, b) => a.ms - b.ms);
  return results[0]?.region ?? "dev";
}

/**
 * Synchronous override — pick region from a pre-measured latency map.
 * Useful when the caller already has latency data from a monitoring system.
 */
export function pickWorkerRegionFromMap(
  latencyMap: Record<string, number>
): WorkerRegion {
  const entries = Object.entries(latencyMap)
    .filter(([key]) => key in REGION_ENDPOINTS)
    .sort(([, a], [, b]) => a - b);
  return (entries[0]?.[0] as WorkerRegion) ?? "dev";
}

/**
 * Build the job submission URL for a given region.
 */
export function buildJobUrl(region: WorkerRegion, path = "/api/automation/run"): string {
  return `${getRegionEndpoint(region)}${path}`;
}
