/**
 * server/monitoring/alertEngine.ts — Clinical system anomaly alert worker
 *
 * FIXES (Code Review Issue #25 — alert silent failure paths):
 *
 *   1. SLA handler errors were swallowed via .catch(() => {}).
 *      A failing SLA breach handler was completely invisible to operators.
 *      Fixed: errors are now logged with full context. handleSLABreach failures
 *      do not crash the interval but are never silently dropped.
 *
 *   2. Static dedup key (lastAlertKey) suppressed ALL subsequent anomaly alerts
 *      after the first one, for as long as the anomaly pattern remained the same.
 *      An ongoing incident (sustained anomaly set) would alert once, then go silent.
 *      Fixed: time-windowed dedup — the same anomaly key is suppressed only for
 *      ALERT_DEDUP_WINDOW_MS (default 5 minutes). After that window, a heartbeat
 *      alert fires to confirm the anomaly is still active, not silently resolved.
 *      A cleared anomaly also fires a "recovered" alert so operators know when
 *      conditions normalize.
 *
 *   3. Alert count is now per-anomaly-key, not a monotonic global counter.
 *      This allows rate-limiting per incident type independently.
 */

import { detectAnomaly }       from "./anomalyDetector";
import { sendPhysicianAlert }  from "../alerts/physicianAlertService";
import { checkSLABreach, handleSLABreach } from "../sre/slaEngine";

// ── Dedup window configuration ────────────────────────────────────────────────

const ALERT_DEDUP_WINDOW_MS = parseInt(
  process.env.ALERT_DEDUP_WINDOW_MS ?? String(5 * 60 * 1000),
  10
);

// ── Alert state ───────────────────────────────────────────────────────────────

interface AlertRecord {
  key:           string;
  firstAlertAt:  number;
  lastAlertAt:   number;
  alertCount:    number;
}

let alertTimer: ReturnType<typeof setInterval> | null = null;
const activeAlerts = new Map<string, AlertRecord>();
let totalAlertCount = 0;

// ── Core handler ──────────────────────────────────────────────────────────────

async function handleAnomalies(): Promise<void> {
  const { anomalies, metrics, severity } = detectAnomaly();

  // ── SLA breach check — errors logged, never swallowed (Issue #25 FIX #1) ──
  const breach = checkSLABreach(metrics);
  if (breach) {
    try {
      await handleSLABreach(breach, metrics);
    } catch (err: any) {
      // FIX: was .catch(() => {}) — now surfaced for operator visibility
      console.error(
        "[AlertEngine] SLA breach handler failed for breach:", breach,
        "—", err?.message ?? err
      );
    }
  }

  // ── Anomaly dedup + heartbeat (Issue #25 FIX #2) ─────────────────────────

  if (anomalies.length === 0) {
    // Check if previously active alerts should be cleared
    if (activeAlerts.size > 0) {
      for (const [key] of activeAlerts) {
        // Fire a recovery alert for each cleared incident
        sendPhysicianAlert({
          caseId:   `system-recovery-${key.slice(0, 12)}`,
          priority: "HIGH",
          reason:   `Anomaly resolved: ${key} | all metrics now within thresholds`,
        }).catch((e: any) => {
          console.error("[AlertEngine] Recovery alert failed:", e?.message);
        });
      }
      activeAlerts.clear();
    }
    return;
  }

  const key      = anomalies.slice().sort().join(",");
  const now      = Date.now();
  const existing = activeAlerts.get(key);
  const priority = severity === "CRITICAL" ? "CRITICAL" : "HIGH";

  if (existing) {
    const timeSinceLastAlert = now - existing.lastAlertAt;

    // Suppress if within dedup window — anomaly already alerted recently
    if (timeSinceLastAlert < ALERT_DEDUP_WINDOW_MS) return;

    // Heartbeat alert: anomaly still active after dedup window — re-alert
    existing.lastAlertAt = now;
    existing.alertCount  += 1;
    totalAlertCount++;

    await sendPhysicianAlert({
      caseId:   `system-alert-${key.slice(0, 8)}-${existing.alertCount}`,
      priority,
      reason: [
        `[ONGOING] System anomalies still active (${Math.round(timeSinceLastAlert / 60000)}m): ${anomalies.join(", ")}`,
        `avgLatency=${metrics.avgLatency.toFixed(0)}ms`,
        `errorRate=${(metrics.errorRate * 100).toFixed(2)}%`,
        `p95=${metrics.p95Latency.toFixed(0)}ms`,
        `requests=${metrics.totalRequests}`,
        `firstSeen=${new Date(existing.firstAlertAt).toISOString()}`,
      ].join(" | "),
    }).catch((e: any) => {
      console.error("[AlertEngine] Heartbeat alert send failed:", e?.message);
    });

  } else {
    // New anomaly — first alert
    totalAlertCount++;
    const record: AlertRecord = {
      key,
      firstAlertAt: now,
      lastAlertAt:  now,
      alertCount:   1,
    };
    activeAlerts.set(key, record);

    await sendPhysicianAlert({
      caseId:   `system-alert-${key.slice(0, 8)}-1`,
      priority,
      reason: [
        `System anomalies detected: ${anomalies.join(", ")}`,
        `avgLatency=${metrics.avgLatency.toFixed(0)}ms`,
        `errorRate=${(metrics.errorRate * 100).toFixed(2)}%`,
        `p95=${metrics.p95Latency.toFixed(0)}ms`,
        `requests=${metrics.totalRequests}`,
      ].join(" | "),
    }).catch((e: any) => {
      console.error("[AlertEngine] Alert send failed:", e?.message);
    });
  }
}

// ── Control ───────────────────────────────────────────────────────────────────

export function startAlertEngine(intervalMs = 10_000): void {
  if (alertTimer) return;
  alertTimer = setInterval(() => {
    handleAnomalies().catch((e) =>
      console.error("[AlertEngine] handleAnomalies error:", e?.message)
    );
  }, intervalMs);
  alertTimer.unref();
  console.log(`[AlertEngine] Anomaly alert worker started (${intervalMs / 1000}s interval, dedup=${ALERT_DEDUP_WINDOW_MS / 1000}s)`);
}

export function stopAlertEngine(): void {
  if (alertTimer) {
    clearInterval(alertTimer);
    alertTimer = null;
  }
}

export function getAlertCount(): number {
  return totalAlertCount;
}

export function getActiveAlerts(): { key: string; firstAlertAt: string; lastAlertAt: string; count: number }[] {
  return [...activeAlerts.values()].map(a => ({
    key:          a.key,
    firstAlertAt: new Date(a.firstAlertAt).toISOString(),
    lastAlertAt:  new Date(a.lastAlertAt).toISOString(),
    count:        a.alertCount,
  }));
}
