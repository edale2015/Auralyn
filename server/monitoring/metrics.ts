import { recordRequest } from "./metricsStore";

export type MetricCategory = "latency" | "accuracy" | "override" | "outcome" | "throughput" | "safety";

interface MetricRecord {
  name: string;
  value: number;
  category: MetricCategory;
  timestamp: string;
  tags?: Record<string, string>;
}

const metricBuffer: MetricRecord[] = [];
const MAX_BUFFER = 500;

export function logMetric(name: string, value: number, category: MetricCategory = "throughput", tags?: Record<string, string>): void {
  console.log(`📊 ${name}: ${value}${tags ? ` [${JSON.stringify(tags)}]` : ""}`);

  metricBuffer.push({ name, value, category, timestamp: new Date().toISOString(), tags });
  if (metricBuffer.length > MAX_BUFFER) metricBuffer.shift();

  if (category === "latency") {
    recordRequest(value, false);
  }
}

export function logLatency(engineName: string, ms: number): void {
  logMetric(`latency.${engineName}`, ms, "latency", { engine: engineName });
}

export function logAccuracy(engineName: string, accuracy: number): void {
  logMetric(`accuracy.${engineName}`, accuracy, "accuracy", { engine: engineName });
  if (accuracy < 0.85) {
    console.warn(`⚠️  [Metrics] Low accuracy on ${engineName}: ${(accuracy * 100).toFixed(1)}%`);
  }
}

export function logOverrideRate(physicianId: string, rate: number): void {
  logMetric(`override_rate.${physicianId}`, rate, "override", { physician: physicianId });
}

export function logPatientOutcome(caseId: string, success: boolean): void {
  logMetric(`outcome.${success ? "success" : "failure"}`, success ? 1 : 0, "outcome", { caseId });
}

export function logSafetyEvent(eventType: string, riskScore: number): void {
  logMetric(`safety.${eventType}`, riskScore, "safety", { eventType });
}

export function getMetricsSummary(): { total: number; byCategory: Record<MetricCategory, number>; recent: MetricRecord[] } {
  const byCategory = {} as Record<MetricCategory, number>;
  for (const m of metricBuffer) {
    byCategory[m.category] = (byCategory[m.category] ?? 0) + 1;
  }
  return {
    total: metricBuffer.length,
    byCategory,
    recent: metricBuffer.slice(-20),
  };
}
