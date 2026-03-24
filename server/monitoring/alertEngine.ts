import { detectAnomaly } from "./anomalyDetector";
import { sendPhysicianAlert } from "../alerts/physicianAlertService";

let alertTimer: ReturnType<typeof setInterval> | null = null;
let lastAlertKey = "";
let alertCount = 0;

async function handleAnomalies(): Promise<void> {
  const { anomalies, metrics, severity } = detectAnomaly();

  if (anomalies.length === 0) {
    if (lastAlertKey !== "") {
      lastAlertKey = "";
    }
    return;
  }

  const key = anomalies.sort().join(",");
  if (key === lastAlertKey) return;

  lastAlertKey = key;
  alertCount++;

  const priority = severity === "CRITICAL" ? "CRITICAL" : "HIGH";

  await sendPhysicianAlert({
    caseId: `system-alert-${alertCount}`,
    priority,
    reason: [
      `System anomalies detected: ${anomalies.join(", ")}`,
      `avgLatency=${metrics.avgLatency.toFixed(0)}ms`,
      `errorRate=${(metrics.errorRate * 100).toFixed(2)}%`,
      `p95=${metrics.p95Latency.toFixed(0)}ms`,
      `requests=${metrics.totalRequests}`,
    ].join(" | "),
  });
}

export function startAlertEngine(intervalMs = 10_000): void {
  if (alertTimer) return;
  alertTimer = setInterval(() => {
    handleAnomalies().catch((e) =>
      console.error("[AlertEngine] handleAnomalies error:", e?.message)
    );
  }, intervalMs);
  alertTimer.unref();
  console.log(`[AlertEngine] Anomaly alert worker started (${intervalMs / 1000}s interval)`);
}

export function stopAlertEngine(): void {
  if (alertTimer) {
    clearInterval(alertTimer);
    alertTimer = null;
  }
}

export function getAlertCount(): number {
  return alertCount;
}
