export interface RegionResult {
  region: string;
  data: unknown;
}

const REGIONS: Record<string, string | undefined> = {
  east: process.env.REGION_EAST,
  west: process.env.REGION_WEST,
  eu:   process.env.REGION_EU,
};

const REGION_ORDER = ["east", "west", "eu"] as const;

export async function routeGlobal(body: unknown): Promise<RegionResult> {
  for (const r of REGION_ORDER) {
    const base = REGIONS[r];
    if (!base) continue;
    try {
      const res = await fetch(`${base}/live/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) return { region: r, data: await res.json() };
    } catch {}
  }
  throw new Error("All regions failed — no healthy endpoint available");
}

export function autoScale(queueDepth: number): number {
  if (queueDepth > 200) return 20;
  if (queueDepth > 100) return 10;
  return 3;
}

export function getConfiguredRegions(): string[] {
  return REGION_ORDER.filter(r => !!REGIONS[r]);
}
