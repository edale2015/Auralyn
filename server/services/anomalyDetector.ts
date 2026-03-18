export type MetricPoint = {
  timestamp: string;
  value: number;
};

export type AnomalyCheckResult = {
  metric: string;
  latest: number;
  mean: number;
  stdDev: number;
  zScore: number;
  isAnomaly: boolean;
  severity: "normal" | "watch" | "critical";
};

function mean(values: number[]) {
  return values.reduce((a, b) => a + b, 0) / Math.max(1, values.length);
}

function stdDev(values: number[]) {
  const m = mean(values);
  const variance = values.reduce((acc, v) => acc + Math.pow(v - m, 2), 0) / Math.max(1, values.length);
  return Math.sqrt(variance);
}

export function detectMetricAnomaly(metric: string, points: MetricPoint[]): AnomalyCheckResult {
  const values = points.map((p) => p.value);
  const latest = values[values.length - 1] ?? 0;
  const baseline = values.slice(0, -1);

  if (baseline.length < 3) {
    return { metric, latest, mean: latest, stdDev: 0, zScore: 0, isAnomaly: false, severity: "normal" };
  }

  const m = mean(baseline);
  const sd = stdDev(baseline) || 0.0001;
  const z = (latest - m) / sd;
  const absZ = Math.abs(z);

  let severity: AnomalyCheckResult["severity"] = "normal";
  if (absZ >= 3) severity = "critical";
  else if (absZ >= 2) severity = "watch";

  return {
    metric,
    latest: Number(latest.toFixed(3)),
    mean: Number(m.toFixed(3)),
    stdDev: Number(sd.toFixed(3)),
    zScore: Number(z.toFixed(3)),
    isAnomaly: absZ >= 2,
    severity,
  };
}

const seededMetrics: Record<string, MetricPoint[]> = {
  override_rate: [
    { timestamp: "2026-03-01", value: 0.05 },
    { timestamp: "2026-03-02", value: 0.06 },
    { timestamp: "2026-03-03", value: 0.04 },
    { timestamp: "2026-03-04", value: 0.055 },
    { timestamp: "2026-03-05", value: 0.048 },
    { timestamp: "2026-03-06", value: 0.18 },
  ],
  escalation_rate: [
    { timestamp: "2026-03-01", value: 0.08 },
    { timestamp: "2026-03-02", value: 0.07 },
    { timestamp: "2026-03-03", value: 0.09 },
    { timestamp: "2026-03-04", value: 0.075 },
    { timestamp: "2026-03-05", value: 0.085 },
    { timestamp: "2026-03-06", value: 0.08 },
  ],
  accuracy: [
    { timestamp: "2026-03-01", value: 0.88 },
    { timestamp: "2026-03-02", value: 0.85 },
    { timestamp: "2026-03-03", value: 0.87 },
    { timestamp: "2026-03-04", value: 0.86 },
    { timestamp: "2026-03-05", value: 0.84 },
    { timestamp: "2026-03-06", value: 0.62 },
  ],
  avg_review_time: [
    { timestamp: "2026-03-01", value: 18 },
    { timestamp: "2026-03-02", value: 16 },
    { timestamp: "2026-03-03", value: 17 },
    { timestamp: "2026-03-04", value: 15 },
    { timestamp: "2026-03-05", value: 19 },
    { timestamp: "2026-03-06", value: 17 },
  ],
};

export function getSeededAnomalies(): AnomalyCheckResult[] {
  return Object.entries(seededMetrics).map(([metric, points]) => detectMetricAnomaly(metric, points));
}
