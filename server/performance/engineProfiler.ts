export interface EngineStats {
  engineName: string;
  calls: number;
  totalLatency: number;
  avgLatency: number;
  errors: number;
  errorRate: number;
  cost: number;
  lastCalled: number;
}

const engineStats: Record<string, EngineStats> = {};

export function recordEngineCall(
  engineName: string,
  latency: number,
  cost: number = 0,
  error: boolean = false
) {
  if (!engineStats[engineName]) {
    engineStats[engineName] = {
      engineName,
      calls: 0,
      totalLatency: 0,
      avgLatency: 0,
      errors: 0,
      errorRate: 0,
      cost: 0,
      lastCalled: 0,
    };
  }

  const stat = engineStats[engineName];
  stat.calls++;
  stat.totalLatency += latency;
  stat.avgLatency = Math.round(stat.totalLatency / stat.calls);
  stat.cost += cost;
  stat.lastCalled = Date.now();
  if (error) stat.errors++;
  stat.errorRate = Number((stat.errors / stat.calls).toFixed(4));
}

export function getEngineStats(): EngineStats[] {
  return Object.values(engineStats).sort((a, b) => b.calls - a.calls);
}

export function getEngineStatsFor(engineName: string): EngineStats | undefined {
  return engineStats[engineName];
}

export function seedProfilerData() {
  const engines = [
    { name: "Adaptive Engine Router", calls: 1240, latency: 45, cost: 0.02, errors: 3 },
    { name: "Unified Reasoning", calls: 1180, latency: 320, cost: 0.15, errors: 8 },
    { name: "Bayesian Differential", calls: 980, latency: 180, cost: 0.08, errors: 2 },
    { name: "Red Flag Engine", calls: 1240, latency: 12, cost: 0, errors: 0 },
    { name: "Knowledge Graph Query", calls: 2100, latency: 8, cost: 0, errors: 1 },
    { name: "Case Similarity", calls: 650, latency: 250, cost: 0.12, errors: 5 },
    { name: "Cluster Scoring", calls: 890, latency: 35, cost: 0.01, errors: 1 },
    { name: "Protocol Selector", calls: 1100, latency: 22, cost: 0, errors: 0 },
    { name: "Symptom Normalizer", calls: 1240, latency: 15, cost: 0, errors: 0 },
    { name: "Disposition Resolver", calls: 1050, latency: 28, cost: 0, errors: 2 },
    { name: "Confidence Calibration", calls: 980, latency: 45, cost: 0.01, errors: 1 },
    { name: "Temporal Risk Engine", calls: 420, latency: 55, cost: 0.02, errors: 0 },
  ];

  engines.forEach((e) => {
    for (let i = 0; i < e.calls; i++) {
      const isError = i < e.errors;
      const jitter = Math.random() * e.latency * 0.3;
      recordEngineCall(e.name, e.latency + jitter, e.cost / e.calls, isError);
    }
  });
}

export function getProfilerSummary() {
  const stats = getEngineStats();
  return {
    totalEngines: stats.length,
    totalCalls: stats.reduce((s, e) => s + e.calls, 0),
    totalErrors: stats.reduce((s, e) => s + e.errors, 0),
    totalCost: Number(stats.reduce((s, e) => s + e.cost, 0).toFixed(4)),
    avgLatency: stats.length
      ? Math.round(stats.reduce((s, e) => s + e.avgLatency, 0) / stats.length)
      : 0,
  };
}
