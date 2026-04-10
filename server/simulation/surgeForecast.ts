export type CapacityState = "normal" | "restrict" | "overload";
export type WorkerScale   = number;

export function forecastSurge(history: number[], lookaheadPct = 1.2): number {
  if (history.length === 0) return 0;
  const avg = history.reduce((a, b) => a + b, 0) / history.length;
  return Math.round(avg * lookaheadPct * 10) / 10;
}

export function forecastWithTrend(history: number[]): number {
  if (history.length < 2) return forecastSurge(history);

  const n   = history.length;
  const avg = history.reduce((a, b) => a + b, 0) / n;
  const trend = (history[n - 1] - history[0]) / Math.max(1, n - 1);

  return Math.max(0, Math.round((avg + trend * 3) * 10) / 10);
}

export function detectCapacityPressure(
  current: number,
  baseline: number,
  thresholdPct = 0.5
): boolean {
  if (baseline === 0) return false;
  return Math.abs(current - baseline) > baseline * thresholdPct;
}

export function adjustCapacity(load: number, highThreshold = 30): CapacityState {
  if (load > highThreshold * 1.5) return "overload";
  if (load > highThreshold)       return "restrict";
  return "normal";
}

export function scaleWorkers(queueDepth: number, maxWorkers = 20): WorkerScale {
  return Math.min(maxWorkers, Math.max(1, Math.floor(queueDepth / 5)));
}

export function syncLearning(regions: Array<{ insights?: unknown[] }>): unknown[] {
  return regions.reduce<unknown[]>((acc, r) => acc.concat(r.insights ?? []), []);
}

export interface SurgeForecastReport {
  baseline:         number;
  forecast:         number;
  trendForecast:    number;
  capacityState:    CapacityState;
  recommendedWorkers: WorkerScale;
  pressureDetected: boolean;
}

export function buildForecastReport(history: number[]): SurgeForecastReport {
  const baseline  = history.length > 0
    ? history.reduce((a, b) => a + b, 0) / history.length
    : 0;
  const forecast      = forecastSurge(history);
  const trendForecast = forecastWithTrend(history);
  const capacityState = adjustCapacity(forecast);
  const recommendedWorkers = scaleWorkers(Math.ceil(forecast));
  const pressureDetected   = detectCapacityPressure(forecast, baseline);

  return { baseline: Math.round(baseline * 10) / 10, forecast, trendForecast, capacityState, recommendedWorkers, pressureDetected };
}
