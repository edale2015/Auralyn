import { EventEmitter } from "events";

export type AlertSeverity = "info" | "warn" | "critical";

export interface AlertEvent {
  id:        string;
  message:   string;
  severity:  AlertSeverity;
  source?:   string;
  timestamp: string;
}

const MAX_BUFFER = 200;
let _id = 0;
const buffer: AlertEvent[] = [];

export const alertBus = new EventEmitter();
alertBus.setMaxListeners(50);

export function emitAlert(
  message: string,
  severity: AlertSeverity = "info",
  source?: string
): AlertEvent {
  const alert: AlertEvent = {
    id:        `alert-${++_id}`,
    message,
    severity,
    source,
    timestamp: new Date().toISOString(),
  };

  buffer.push(alert);
  if (buffer.length > MAX_BUFFER) buffer.shift();

  alertBus.emit("alert",           alert);
  alertBus.emit(`alert:${severity}`, alert);

  if (severity === "critical") {
    console.error(`🚨 [ALERT:CRITICAL] ${message}${source ? ` (${source})` : ""}`);
  } else if (severity === "warn") {
    console.warn(`⚠️  [ALERT:WARN] ${message}${source ? ` (${source})` : ""}`);
  } else {
    console.log(`ℹ️  [ALERT:INFO] ${message}${source ? ` (${source})` : ""}`);
  }

  return alert;
}

export function onAlert(cb: (alert: AlertEvent) => void): () => void {
  alertBus.on("alert", cb);
  return () => alertBus.off("alert", cb);
}

export function onAlertBySeverity(severity: AlertSeverity, cb: (alert: AlertEvent) => void): () => void {
  alertBus.on(`alert:${severity}`, cb);
  return () => alertBus.off(`alert:${severity}`, cb);
}

export function getRecentAlerts(n = 50): AlertEvent[] {
  return buffer.slice(-n);
}

export function getAlertStats(): { total: number; bySeverity: Record<AlertSeverity, number> } {
  const bySeverity = { info: 0, warn: 0, critical: 0 } as Record<AlertSeverity, number>;
  for (const a of buffer) bySeverity[a.severity]++;
  return { total: buffer.length, bySeverity };
}

export function clearAlerts(): void {
  buffer.length = 0;
}
