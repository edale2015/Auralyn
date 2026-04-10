export const REGIONS = ["us-east-1", "us-west-2", "eu-central-1"] as const;
export type AWSRegion = typeof REGIONS[number];

export interface ECSTaskDefinition {
  family: string;
  containerDefinitions: Array<{
    name: string;
    image: string;
    memory: number;
    cpu: number;
    portMappings?: Array<{ containerPort: number; protocol?: string }>;
    environment?: Array<{ name: string; value: string }>;
  }>;
}

export const AURALYN_TASK_DEF: ECSTaskDefinition = {
  family: "auralyn-task",
  containerDefinitions: [
    {
      name: "app",
      image: "auralyn:latest",
      memory: 1024,
      cpu: 512,
      portMappings: [{ containerPort: 5000, protocol: "tcp" }],
      environment: [
        { name: "NODE_ENV", value: "production" },
        { name: "PORT", value: "5000" },
      ],
    },
  ],
};

export function routeByLatency(latencies: Record<string, number>): string {
  const entries = Object.entries(latencies);
  if (entries.length === 0) return REGIONS[0];
  return entries.sort((a, b) => a[1] - b[1])[0][0];
}

export function replicateEvent(event: unknown, regions: string[]): void {
  regions.forEach((r) => {
    const url = process.env[`REGION_URL_${r.replace(/-/g, "_").toUpperCase()}`];
    if (!url) return;
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
    }).catch((e) => console.warn(`[AWS-Regions] Replication to ${r} failed:`, e?.message));
  });
}

export function getRegionHealth(): Record<AWSRegion, "healthy" | "unknown"> {
  const health: Partial<Record<AWSRegion, "healthy" | "unknown">> = {};
  for (const r of REGIONS) {
    health[r] = process.env[`REGION_URL_${r.replace(/-/g, "_").toUpperCase()}`]
      ? "healthy"
      : "unknown";
  }
  return health as Record<AWSRegion, "healthy" | "unknown">;
}
