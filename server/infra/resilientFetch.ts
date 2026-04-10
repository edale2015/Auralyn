export interface ClusterRegion {
  name:    string;
  url:     string;
  healthy: boolean;
}

const DEFAULT_REGIONS: ClusterRegion[] = [
  { name: "us-east",    url: process.env.CLUSTER_US_EAST  ?? "https://us-east.api",    healthy: true },
  { name: "us-west",    url: process.env.CLUSTER_US_WEST  ?? "https://us-west.api",    healthy: true },
  { name: "eu-central", url: process.env.CLUSTER_EU       ?? "https://eu.api",         healthy: true },
];

let regions: ClusterRegion[] = [...DEFAULT_REGIONS];
let _healthTimer: ReturnType<typeof setInterval> | null = null;

export function getRegions(): ClusterRegion[] {
  return regions;
}

export function getHealthyRegion(): ClusterRegion {
  return regions.find(r => r.healthy) ?? regions[0];
}

export async function resilientFetch(
  path: string,
  options: RequestInit = {},
  timeoutMs = 5000
): Promise<unknown> {
  for (const region of regions) {
    if (!region.healthy) continue;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(region.url + path, { ...options, signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) return res.json();
      throw new Error(`HTTP ${res.status}`);
    } catch (err: any) {
      clearTimeout(timer);
      console.warn(`[ResilientFetch] Region ${region.name} failed: ${err.message}`);
      region.healthy = false;
    }
  }

  throw new Error("All cluster regions failed");
}

export function startHealthCheckLoop(intervalMs = 30_000): void {
  if (_healthTimer) return;

  _healthTimer = setInterval(async () => {
    for (const region of regions) {
      try {
        const res = await fetch(`${region.url}/health`, { signal: AbortSignal.timeout(3000) });
        const wasHealthy = region.healthy;
        region.healthy = res.ok;

        if (!wasHealthy && region.healthy) {
          console.log(`[ResilientFetch] Region ${region.name} recovered`);
        }
      } catch {
        if (region.healthy) {
          console.warn(`[ResilientFetch] Region ${region.name} marked unhealthy`);
        }
        region.healthy = false;
      }
    }
  }, intervalMs);

  console.log(`[ResilientFetch] Health check loop started (${intervalMs}ms interval)`);
}

export function stopHealthCheckLoop(): void {
  if (_healthTimer) { clearInterval(_healthTimer); _healthTimer = null; }
}

export function resetRegionHealth(): void {
  regions.forEach(r => (r.healthy = true));
}
