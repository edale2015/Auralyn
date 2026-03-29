import { logIncident } from "./incidents";

export type AlertSeverity = "INFO" | "WARN" | "HIGH" | "CRITICAL";

export interface SystemAlert {
  alertId: string;
  severity: AlertSeverity;
  message: string;
  metric?: string;
  value?: number;
  threshold?: number;
  triggeredAt: string;
}

const alertHistory: SystemAlert[] = [];

const THRESHOLDS = {
  latencyMs:    2000,
  errorRate:    0.05,
  erRate:       0.40,
  memoryMb:     800,
};

export function checkSystemHealth(metrics: {
  avgLatencyMs?: number;
  errorRate?: number;
  erRate?: number;
  memoryMb?: number;
  [key: string]: number | undefined;
}): SystemAlert | null {
  let severity: AlertSeverity | null = null;
  let message = "";
  let metric = "";
  let value = 0;
  let threshold = 0;

  if ((metrics.avgLatencyMs ?? 0) > THRESHOLDS.latencyMs) {
    severity  = "HIGH";
    message   = `Latency spike detected: ${metrics.avgLatencyMs}ms (threshold ${THRESHOLDS.latencyMs}ms)`;
    metric    = "avgLatencyMs";
    value     = metrics.avgLatencyMs!;
    threshold = THRESHOLDS.latencyMs;
  } else if ((metrics.errorRate ?? 0) > THRESHOLDS.errorRate) {
    severity  = "HIGH";
    message   = `Error rate elevated: ${((metrics.errorRate ?? 0) * 100).toFixed(1)}% (threshold ${THRESHOLDS.errorRate * 100}%)`;
    metric    = "errorRate";
    value     = metrics.errorRate!;
    threshold = THRESHOLDS.errorRate;
  } else if ((metrics.erRate ?? 0) > THRESHOLDS.erRate) {
    severity  = "WARN";
    message   = `ER escalation rate elevated: ${((metrics.erRate ?? 0) * 100).toFixed(0)}%`;
    metric    = "erRate";
    value     = metrics.erRate!;
    threshold = THRESHOLDS.erRate;
  } else if ((metrics.memoryMb ?? 0) > THRESHOLDS.memoryMb) {
    severity  = "WARN";
    message   = `Memory pressure: ${metrics.memoryMb}MB`;
    metric    = "memoryMb";
    value     = metrics.memoryMb!;
    threshold = THRESHOLDS.memoryMb;
  }

  if (!severity) return null;

  const alert: SystemAlert = {
    alertId: `ALT-${Date.now()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`,
    severity,
    message,
    metric,
    value,
    threshold,
    triggeredAt: new Date().toISOString(),
  };

  alertHistory.push(alert);

  if (severity === "HIGH" || severity === "CRITICAL") {
    logIncident({ severity, category: "system_health", message, detail: alert });
  }

  return alert;
}

export function getAlertHistory(limit = 50): SystemAlert[] {
  return alertHistory.slice(-limit).reverse();
}

export function getSystemAlertStats() {
  const open  = alertHistory.filter((a) => a.severity === "HIGH" || a.severity === "CRITICAL").length;
  return {
    active: true,
    total: alertHistory.length,
    highOrCritical: open,
    thresholds: THRESHOLDS,
  };
}
