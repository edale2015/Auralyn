export interface PatientResult {
  patientId: string;
  disposition: string;
  latencyMs: number;
  timestamp?: string;
}

export interface LiveStats {
  patients: number;
  er: number;
  latency: number[];
}

export interface AggregatedStats {
  patients: number;
  er: number;
  erRate: number;
  avgLatencyMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  minLatencyMs: number;
  maxLatencyMs: number;
}

export const liveStats: LiveStats = {
  patients: 0,
  er: 0,
  latency: [],
};

const MAX_LATENCY_SAMPLES = 10_000;

export function updateStats(result: PatientResult): void {
  liveStats.patients++;
  if (result.disposition === "ER_NOW") liveStats.er++;
  liveStats.latency.push(result.latencyMs);
  if (liveStats.latency.length > MAX_LATENCY_SAMPLES) {
    liveStats.latency.shift();
  }
}

export function resetStats(): void {
  liveStats.patients = 0;
  liveStats.er = 0;
  liveStats.latency = [];
}

function pct(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.floor(sorted.length * p)] ?? sorted[sorted.length - 1];
}

export function aggregateStats(): AggregatedStats {
  const { patients, er, latency } = liveStats;
  if (patients === 0) {
    return { patients: 0, er: 0, erRate: 0, avgLatencyMs: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0, minLatencyMs: 0, maxLatencyMs: 0 };
  }

  const sorted = [...latency].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);

  return {
    patients,
    er,
    erRate: er / patients,
    avgLatencyMs: Math.round(sum / sorted.length),
    p50Ms: pct(sorted, 0.5),
    p95Ms: pct(sorted, 0.95),
    p99Ms: pct(sorted, 0.99),
    minLatencyMs: sorted[0] ?? 0,
    maxLatencyMs: sorted[sorted.length - 1] ?? 0,
  };
}
