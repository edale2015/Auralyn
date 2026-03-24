export type RegionHealth = "healthy" | "degraded" | "down";

export type Region = {
  id: string;
  name: string;
  baseUrl: string;
  health: RegionHealth;
  latencyMs: number;
  lastChecked: number;
};

const regions: Region[] = [
  { id: "nyc", name: "New York",   baseUrl: process.env.REGION_NYC_URL ?? "https://nyc.api", health: "healthy", latencyMs: 20,  lastChecked: Date.now() },
  { id: "us-west", name: "California", baseUrl: process.env.REGION_USW_URL ?? "https://usw.api", health: "healthy", latencyMs: 80,  lastChecked: Date.now() },
  { id: "eu",  name: "Europe",     baseUrl: process.env.REGION_EU_URL  ?? "https://eu.api",  health: "healthy", latencyMs: 120, lastChecked: Date.now() },
];

export function getRegions(): Region[] {
  return regions;
}

export function markRegionHealth(id: string, health: RegionHealth, latencyMs?: number): void {
  const r = regions.find((x) => x.id === id);
  if (r) {
    r.health = health;
    r.lastChecked = Date.now();
    if (latencyMs !== undefined) r.latencyMs = latencyMs;
  }
}

export function selectRegion(preferredId?: string): Region {
  const healthy = regions.filter((r) => r.health === "healthy");
  if (!healthy.length) throw new Error("NO_REGIONS_AVAILABLE");

  if (preferredId) {
    const preferred = healthy.find((r) => r.id === preferredId);
    if (preferred) return preferred;
  }

  return healthy.sort((a, b) => a.latencyMs - b.latencyMs)[0];
}

export async function callWithFailover<T>(fn: (region: Region) => Promise<T>): Promise<T> {
  const sorted = [...regions].sort((a, b) => a.latencyMs - b.latencyMs);
  const errors: string[] = [];

  for (const r of sorted) {
    try {
      const result = await fn(r);
      markRegionHealth(r.id, "healthy");
      return result;
    } catch (e: any) {
      errors.push(`${r.id}: ${e?.message}`);
      markRegionHealth(r.id, "degraded");
    }
  }

  throw new Error(`ALL_REGIONS_FAILED: ${errors.join(" | ")}`);
}

export function getRegionSummary() {
  return regions.map(({ id, name, health, latencyMs, lastChecked }) => ({
    id, name, health, latencyMs, lastChecked: new Date(lastChecked).toISOString(),
  }));
}
