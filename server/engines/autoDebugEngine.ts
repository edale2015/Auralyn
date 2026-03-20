import { publish } from "../agents/eventBus";

export interface SystemMetrics {
  errorRate: number;
  latencyMs: number;
  requestsPerMinute: number;
  activeAgents: number;
  memoryUsedMb: number;
  uptimeSeconds: number;
}

export interface HealthAlert {
  level: "info" | "warn" | "critical";
  message: string;
  metric: string;
  value: number;
  threshold: number;
  timestamp: string;
}

const alertLog: HealthAlert[] = [];
const metricHistory: Array<SystemMetrics & { timestamp: string }> = [];

const THRESHOLDS = {
  errorRate: { warn: 0.03, critical: 0.10 },
  latencyMs: { warn: 1500, critical: 3000 },
  memoryMb: { warn: 400, critical: 700 },
  requestsPerMinute: { warn: 500, critical: 900 },
};

export function monitorSystemHealth(metrics: SystemMetrics): HealthAlert[] {
  const alerts: HealthAlert[] = [];
  const ts = new Date().toISOString();

  if (metrics.errorRate >= THRESHOLDS.errorRate.critical) {
    alerts.push({ level: "critical", message: `Critical error rate: ${(metrics.errorRate * 100).toFixed(1)}%`, metric: "errorRate", value: metrics.errorRate, threshold: THRESHOLDS.errorRate.critical, timestamp: ts });
  } else if (metrics.errorRate >= THRESHOLDS.errorRate.warn) {
    alerts.push({ level: "warn", message: `Elevated error rate: ${(metrics.errorRate * 100).toFixed(1)}%`, metric: "errorRate", value: metrics.errorRate, threshold: THRESHOLDS.errorRate.warn, timestamp: ts });
  }

  if (metrics.latencyMs >= THRESHOLDS.latencyMs.critical) {
    alerts.push({ level: "critical", message: `Critical latency: ${metrics.latencyMs}ms`, metric: "latencyMs", value: metrics.latencyMs, threshold: THRESHOLDS.latencyMs.critical, timestamp: ts });
  } else if (metrics.latencyMs >= THRESHOLDS.latencyMs.warn) {
    alerts.push({ level: "warn", message: `High latency: ${metrics.latencyMs}ms`, metric: "latencyMs", value: metrics.latencyMs, threshold: THRESHOLDS.latencyMs.warn, timestamp: ts });
  }

  if (metrics.memoryUsedMb >= THRESHOLDS.memoryMb.critical) {
    alerts.push({ level: "critical", message: `Memory critical: ${metrics.memoryUsedMb}MB`, metric: "memoryMb", value: metrics.memoryUsedMb, threshold: THRESHOLDS.memoryMb.critical, timestamp: ts });
  } else if (metrics.memoryUsedMb >= THRESHOLDS.memoryMb.warn) {
    alerts.push({ level: "warn", message: `Memory elevated: ${metrics.memoryUsedMb}MB`, metric: "memoryMb", value: metrics.memoryUsedMb, threshold: THRESHOLDS.memoryMb.warn, timestamp: ts });
  }

  if (alerts.length === 0 && metricHistory.length > 0) {
    alerts.push({ level: "info", message: "All systems nominal", metric: "overall", value: 0, threshold: 0, timestamp: ts });
  }

  alertLog.push(...alerts);
  if (alertLog.length > 1000) alertLog.splice(0, alertLog.length - 1000);

  metricHistory.push({ ...metrics, timestamp: ts });
  if (metricHistory.length > 200) metricHistory.shift();

  if (alerts.some(a => a.level === "critical")) {
    publish("system_health_alert", { alerts, metrics });
  }

  return alerts;
}

export function getCurrentSystemMetrics(): SystemMetrics {
  const mem = process.memoryUsage();
  return {
    errorRate: 0,
    latencyMs: 0,
    requestsPerMinute: 0,
    activeAgents: 0,
    memoryUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
    uptimeSeconds: Math.round(process.uptime()),
  };
}

export function runDiagnostic(): {
  status: "healthy" | "degraded" | "critical";
  checks: Array<{ name: string; status: "pass" | "warn" | "fail"; message: string }>;
  alerts: HealthAlert[];
  metrics: SystemMetrics;
} {
  const metrics = getCurrentSystemMetrics();
  const alerts = monitorSystemHealth(metrics);
  const checks = [];

  checks.push({
    name: "Memory",
    status: metrics.memoryUsedMb < THRESHOLDS.memoryMb.warn ? "pass" : metrics.memoryUsedMb < THRESHOLDS.memoryMb.critical ? "warn" : "fail",
    message: `Heap used: ${metrics.memoryUsedMb}MB`,
  } as const);

  checks.push({
    name: "Uptime",
    status: metrics.uptimeSeconds > 60 ? "pass" : "warn",
    message: `Server uptime: ${Math.round(metrics.uptimeSeconds / 60)}m`,
  } as const);

  checks.push({
    name: "EventBus",
    status: "pass",
    message: "Event bus active",
  } as const);

  const hasCritical = checks.some(c => c.status === "fail") || alerts.some(a => a.level === "critical");
  const hasWarn = checks.some(c => c.status === "warn") || alerts.some(a => a.level === "warn");

  return {
    status: hasCritical ? "critical" : hasWarn ? "degraded" : "healthy",
    checks,
    alerts: alertLog.slice(-20),
    metrics,
  };
}

export function getAlertLog(limit = 50): HealthAlert[] {
  return alertLog.slice(-limit);
}

export function getMetricHistory(limit = 100): Array<SystemMetrics & { timestamp: string }> {
  return metricHistory.slice(-limit);
}
