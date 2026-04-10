import { deployRegion, type Region } from "./rolloutEngine";

export interface ExpansionTarget {
  name: string;
  load: number;
  population: number;
  region?: string;
  [key: string]: unknown;
}

export async function nationalRollout(
  regions: ExpansionTarget[]
): Promise<{ deployed: string[]; skipped: string[] }> {
  const deployed: string[] = [];
  const skipped: string[] = [];

  for (const r of regions) {
    if (r.load < 0.5 && r.population > 500_000) {
      await deployRegion(r as unknown as Region);
      deployed.push(r.name);
      console.log(`[NationalRollout] Deployed: ${r.name}`);
    } else {
      skipped.push(r.name);
    }
  }

  return { deployed, skipped };
}

export function scoreExpansionTarget(region: ExpansionTarget): number {
  const capacityScore = 1 - region.load;
  const sizeScore     = Math.min(1, region.population / 1_000_000);
  return capacityScore * 0.6 + sizeScore * 0.4;
}
