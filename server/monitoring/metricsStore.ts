const metrics = {
  totalRequests: 0,
  totalErrors: 0,
  latencies: [] as number[],
};

const MAX_LATENCIES = 1000;

export function recordRequest(latency: number, isError: boolean) {
  metrics.totalRequests++;
  if (isError) metrics.totalErrors++;
  metrics.latencies.push(latency);
  if (metrics.latencies.length > MAX_LATENCIES) {
    metrics.latencies.shift();
  }
}

export function getMetrics() {
  const avgLatency =
    metrics.latencies.length > 0
      ? metrics.latencies.reduce((a, b) => a + b, 0) / metrics.latencies.length
      : 0;

  const p95Index = Math.floor(metrics.latencies.length * 0.95);
  const sorted = [...metrics.latencies].sort((a, b) => a - b);
  const p95Latency = sorted[p95Index] || 0;

  return {
    totalRequests: metrics.totalRequests,
    totalErrors: metrics.totalErrors,
    errorRate:
      metrics.totalRequests > 0
        ? Number((metrics.totalErrors / metrics.totalRequests).toFixed(4))
        : 0,
    avgLatency: Number(avgLatency.toFixed(2)),
    p95Latency,
    windowSize: metrics.latencies.length,
  };
}

export function resetMetrics() {
  metrics.totalRequests = 0;
  metrics.totalErrors = 0;
  metrics.latencies.length = 0;
}
