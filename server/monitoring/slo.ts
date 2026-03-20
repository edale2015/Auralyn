import { emitEvent } from "../controlTower/eventBus";

export const SLO = {
  latencyP95Ms: 1200,
  errorRate: 0.05,
  minRequestsForEvaluation: 20,
} as const;

export interface SloResult {
  latencyP95Ms: number;
  errorRate: number;
  sloBreached: boolean;
  alerts: string[];
  sloStatus: "OK" | "BREACHED";
  checkedAt: string;
}

let lastBreachEmittedAt = 0;
const BREACH_EMIT_COOLDOWN_MS = 60_000;

export function checkSLO(metrics: {
  p95Latency: number;
  errorRate: number;
  totalRequests: number;
}): SloResult {
  const alerts: string[] = [];

  if (metrics.totalRequests < SLO.minRequestsForEvaluation) {
    return {
      latencyP95Ms: metrics.p95Latency,
      errorRate: metrics.errorRate,
      sloBreached: false,
      alerts: [],
      sloStatus: "OK",
      checkedAt: new Date().toISOString(),
    };
  }

  if (metrics.p95Latency > SLO.latencyP95Ms) {
    alerts.push(`Latency SLO breached: P95=${metrics.p95Latency}ms > threshold ${SLO.latencyP95Ms}ms`);
  }

  if (metrics.errorRate > SLO.errorRate) {
    alerts.push(`Error rate SLO breached: ${(metrics.errorRate * 100).toFixed(2)}% > threshold ${SLO.errorRate * 100}%`);
  }

  const sloBreached = alerts.length > 0;

  if (sloBreached) {
    const now = Date.now();
    if (now - lastBreachEmittedAt > BREACH_EMIT_COOLDOWN_MS) {
      lastBreachEmittedAt = now;
      emitEvent({
        type: "ALERT",
        payload: {
          source: "sloMonitor",
          severity: "HIGH",
          alerts,
          p95Latency: metrics.p95Latency,
          errorRate: metrics.errorRate,
        },
        timestamp: now,
      });
    }
  }

  return {
    latencyP95Ms: metrics.p95Latency,
    errorRate: metrics.errorRate,
    sloBreached,
    alerts,
    sloStatus: sloBreached ? "BREACHED" : "OK",
    checkedAt: new Date().toISOString(),
  };
}
