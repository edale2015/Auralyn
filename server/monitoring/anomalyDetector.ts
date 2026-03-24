import { getMetrics } from "./metricsStore";

export interface AnomalyResult {
  anomalies: string[];
  metrics: ReturnType<typeof getMetrics>;
  severity: "HEALTHY" | "DEGRADED" | "CRITICAL";
  checkedAt: string;
}

export function detectAnomaly(metrics?: ReturnType<typeof getMetrics>): AnomalyResult {
  const m = metrics ?? getMetrics();
  const anomalies: string[] = [];

  if (m.avgLatency > 2000) anomalies.push("HIGH_LATENCY");
  if (m.p95Latency > 5000) anomalies.push("P95_LATENCY_CRITICAL");
  if (m.errorRate > 0.1) anomalies.push("CRITICAL_ERROR_RATE");
  else if (m.errorRate > 0.05) anomalies.push("HIGH_ERROR_RATE");
  if (m.totalRequests > 0 && m.windowSize === 0) anomalies.push("METRICS_STALE");

  const severity: AnomalyResult["severity"] =
    anomalies.some(a => a.includes("CRITICAL")) ? "CRITICAL"
    : anomalies.length > 0 ? "DEGRADED"
    : "HEALTHY";

  return { anomalies, metrics: m, severity, checkedAt: new Date().toISOString() };
}
