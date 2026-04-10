export interface Region {
  name: string;
  url: string | undefined;
}

export const REGIONS: Region[] = [
  { name: "us-east", url: process.env.REGION_US_EAST },
  { name: "us-west", url: process.env.REGION_US_WEST },
  { name: "eu",      url: process.env.REGION_EU },
];

export function pickRegionByIP(ip: string): Region {
  if (ip.startsWith("172")) return REGIONS[0];
  if (ip.startsWith("10"))  return REGIONS[1];
  return REGIONS[2];
}

export async function gatewayFetch(
  ip: string,
  method: string,
  path: string,
  body: Record<string, any>
): Promise<unknown> {
  const primary = pickRegionByIP(ip);
  const order = [primary, ...REGIONS.filter(r => r !== primary)];

  for (const r of order) {
    if (!r.url) continue;
    try {
      const res = await fetch(r.url + path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) return res.json();
    } catch {
      continue;
    }
  }
  throw new Error("All regions failed or unconfigured");
}

export function desiredWorkers(queueDepth: number): number {
  if (queueDepth > 200) return 20;
  if (queueDepth > 100) return 12;
  if (queueDepth > 50)  return 6;
  return 2;
}
