export type GeoRegion = "us-east" | "us-west" | "eu-central" | "asia-pacific" | "default";

const IP_RULES: Array<{ prefix: string; region: GeoRegion }> = [
  { prefix: "172.",  region: "us-east"       },
  { prefix: "10.",   region: "us-west"        },
  { prefix: "192.",  region: "eu-central"     },
  { prefix: "103.",  region: "asia-pacific"   },
  { prefix: "52.",   region: "us-east"        },
  { prefix: "34.",   region: "us-west"        },
  { prefix: "35.",   region: "eu-central"     },
];

const REGION_ENV: Record<GeoRegion, string> = {
  "us-east":      process.env.REGION_US_EAST     ?? "",
  "us-west":      process.env.REGION_US_WEST     ?? "",
  "eu-central":   process.env.REGION_EU_CENTRAL  ?? "",
  "asia-pacific": process.env.REGION_ASIA        ?? "",
  "default":      process.env.REGION_DEFAULT     ?? "",
};

export function selectRegionByIp(clientIp: string): GeoRegion {
  const normalised = (clientIp ?? "").replace(/^::ffff:/, "");

  for (const rule of IP_RULES) {
    if (normalised.startsWith(rule.prefix)) return rule.region;
  }

  return "default";
}

export function getRegionUrl(region: GeoRegion): string | null {
  return REGION_ENV[region] || REGION_ENV["default"] || null;
}

export async function routeRequestByGeo(
  path: string,
  req: { ip?: string; method?: string; body?: unknown }
): Promise<Response> {
  const region = selectRegionByIp(req.ip ?? "");
  const url    = getRegionUrl(region);

  if (!url) throw new Error(`No URL configured for geo-region: ${region}`);

  return fetch(url + path, {
    method:  req.method ?? "GET",
    headers: { "Content-Type": "application/json" },
    body:    req.body && req.method !== "GET" ? JSON.stringify(req.body) : undefined,
  });
}

export async function globalFetch(path: string): Promise<unknown> {
  const regions: GeoRegion[] = ["us-east", "us-west", "eu-central", "asia-pacific", "default"];

  for (const region of regions) {
    const url = getRegionUrl(region);
    if (!url) continue;

    try {
      const res = await fetch(url + path);
      if (res.ok) return res.json();
    } catch {}
  }

  throw new Error("Global outage — all geo-regions unreachable");
}
