export interface HotPathMetrics {
  totalExecutions: number;
  avgDurationMs: number;
  p95DurationMs: number;
  cacheHitRate: number;
}

const durations: number[] = [];

export function recordExecution(durationMs: number): void {
  durations.push(durationMs);
  if (durations.length > 10000) durations.splice(0, durations.length - 10000);
}

export function getHotPathMetrics(): HotPathMetrics {
  if (durations.length === 0) return { totalExecutions: 0, avgDurationMs: 0, p95DurationMs: 0, cacheHitRate: 0 };

  const sorted = [...durations].sort((a, b) => a - b);
  const avg = durations.reduce((s, d) => s + d, 0) / durations.length;
  const p95Idx = Math.floor(sorted.length * 0.95);

  return {
    totalExecutions: durations.length,
    avgDurationMs: Math.round(avg * 100) / 100,
    p95DurationMs: sorted[p95Idx] || 0,
    cacheHitRate: 0,
  };
}
