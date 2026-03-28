const latencyHistory = new Map<string, number[]>();
const MAX_HISTORY = 20;

export function trackLatency(name: string, latency: number) {
  const arr = latencyHistory.get(name) ?? [];
  arr.push(latency);
  if (arr.length > MAX_HISTORY) arr.shift();
  latencyHistory.set(name, arr);
}

export interface DegradationAlert {
  name: string;
  avgLatencyMs: number;
  trend: "rising" | "stable" | "falling";
  samples: number;
}

export function detectDegradation(): DegradationAlert[] {
  const alerts: DegradationAlert[] = [];
  for (const [name, arr] of latencyHistory.entries()) {
    if (arr.length < 5) continue;
    const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
    if (avg > 1500) {
      const recent = arr.slice(-5).reduce((a, b) => a + b, 0) / 5;
      const older  = arr.slice(0, 5).reduce((a, b) => a + b, 0) / 5;
      const trend  = recent > older * 1.2 ? "rising" : recent < older * 0.8 ? "falling" : "stable";
      alerts.push({ name, avgLatencyMs: Math.round(avg), trend, samples: arr.length });
    }
  }
  return alerts;
}

export function getLatencyHistory(name: string): number[] {
  return latencyHistory.get(name) ?? [];
}

export function getAllLatencyHistories(): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  for (const [k, v] of latencyHistory.entries()) out[k] = v;
  return out;
}
