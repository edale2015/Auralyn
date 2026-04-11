export interface RegionState {
  name: string;
  load: number;       // 0..1
  latencyMs: number;
  healthy: boolean;
}

export interface RebalanceAction {
  from: string;
  to:   string | undefined;
  action: "shift_traffic";
}

export function pickBestRegion(regions: RegionState[]): RegionState | null {
  const healthy = regions.filter(r => r.healthy);
  if (healthy.length === 0) return null;
  return healthy.sort(
    (a, b) => (a.load + a.latencyMs / 1_000) - (b.load + b.latencyMs / 1_000)
  )[0];
}

export function rebalance(regions: RegionState[]): RebalanceAction[] {
  const hot  = regions.filter(r => r.load > 0.8);
  const cold = regions.filter(r => r.load < 0.5);
  return hot.map(h => ({
    from:   h.name,
    to:     cold[0]?.name,
    action: "shift_traffic" as const,
  }));
}

export function networkHealth(regions: RegionState[]): {
  healthy: number;
  degraded: number;
  avgLoad: number;
} {
  const healthy  = regions.filter(r => r.healthy).length;
  const avgLoad  = regions.length
    ? regions.reduce((s, r) => s + r.load, 0) / regions.length
    : 0;
  return { healthy, degraded: regions.length - healthy, avgLoad };
}
