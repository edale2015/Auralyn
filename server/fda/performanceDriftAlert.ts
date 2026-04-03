/**
 * PERFORMANCE DRIFT ALERT — FDA SaMD Performance Monitoring
 *
 * Monitors real-time accuracy against a baseline and alerts when drift
 * exceeds the clinical safety threshold (3 percentage points).
 *
 * Implements:
 *   - FDA Guidance: "Predetermined Change Control Plan" requirements
 *   - ISO 14971 risk control monitoring
 *   - Automatic alert escalation on sustained drift
 */

import { getPerformanceStats } from "../compliance/performanceRegistry";
import { logMetric, logSafetyEvent } from "../monitoring/metrics";

export interface DriftAlert {
  alertId: string;
  triggeredAt: string;
  currentAccuracy: number;
  baselineAccuracy: number;
  driftPct: number;
  driftThresholdPct: number;
  severity: "WARNING" | "CRITICAL";
  recommendation: string;
  sampleSize: number;
}

const DRIFT_WARNING_THRESHOLD_PCT = 3.0;
const DRIFT_CRITICAL_THRESHOLD_PCT = 5.0;
const MIN_SAMPLES_FOR_ALERT = 20;

let baselineAccuracy: number | null = null;
const alertHistory: DriftAlert[] = [];

export function setDriftBaseline(accuracy: number): void {
  baselineAccuracy = accuracy;
  console.log(`[DriftAlert] Baseline set: ${accuracy.toFixed(1)}%`);
}

export function checkPerformanceDrift(): DriftAlert | null {
  const stats = getPerformanceStats();

  if (stats.total < MIN_SAMPLES_FOR_ALERT) return null;

  if (baselineAccuracy === null) {
    baselineAccuracy = stats.accuracy;
    console.log(`[DriftAlert] Auto-baseline initialized: ${baselineAccuracy.toFixed(1)}%`);
    return null;
  }

  const driftPct = baselineAccuracy - stats.accuracy;

  logMetric("performance.accuracy_current", stats.accuracy, "accuracy");
  logMetric("performance.accuracy_baseline", baselineAccuracy, "accuracy");
  logMetric("performance.drift_pct", driftPct, "accuracy");

  if (driftPct >= DRIFT_WARNING_THRESHOLD_PCT) {
    const severity: "WARNING" | "CRITICAL" =
      driftPct >= DRIFT_CRITICAL_THRESHOLD_PCT ? "CRITICAL" : "WARNING";

    const alert: DriftAlert = {
      alertId: `DRIFT-${Date.now()}`,
      triggeredAt: new Date().toISOString(),
      currentAccuracy: stats.accuracy,
      baselineAccuracy,
      driftPct: Math.round(driftPct * 100) / 100,
      driftThresholdPct: DRIFT_WARNING_THRESHOLD_PCT,
      severity,
      recommendation:
        severity === "CRITICAL"
          ? "IMMEDIATE ACTION REQUIRED: Accuracy has fallen below safe operating threshold. Suspend autonomous triage and escalate to clinical review team. FDA Predetermined Change Control Plan may need to trigger re-validation."
          : "WARNING: Accuracy drift detected. Increase physician override monitoring. Review recent misclassified cases for pattern. Prepare re-validation dataset.",
      sampleSize: stats.total,
    };

    alertHistory.push(alert);
    if (alertHistory.length > 50) alertHistory.shift();

    logSafetyEvent(`performance_drift_${severity.toLowerCase()}`, driftPct / 100);

    const emoji = severity === "CRITICAL" ? "🚨" : "⚠️";
    console.warn(
      `${emoji} [DriftAlert] ${severity}: accuracy ${stats.accuracy.toFixed(1)}% vs baseline ${baselineAccuracy.toFixed(1)}% — drift ${driftPct.toFixed(1)}pp`,
    );

    return alert;
  }

  return null;
}

export function getDriftAlertHistory(): DriftAlert[] {
  return alertHistory.slice().reverse();
}

export function getLatestDriftAlert(): DriftAlert | null {
  return alertHistory.length > 0 ? alertHistory[alertHistory.length - 1] : null;
}

export function getDriftStatus(): {
  baselineAccuracy: number | null;
  currentAccuracy: number;
  driftPct: number;
  isInDrift: boolean;
  latestAlert: DriftAlert | null;
} {
  const stats = getPerformanceStats();
  const driftPct = baselineAccuracy !== null ? baselineAccuracy - stats.accuracy : 0;

  return {
    baselineAccuracy,
    currentAccuracy: stats.accuracy,
    driftPct: Math.round(driftPct * 100) / 100,
    isInDrift: driftPct >= DRIFT_WARNING_THRESHOLD_PCT,
    latestAlert: getLatestDriftAlert(),
  };
}

let driftTimer: ReturnType<typeof setInterval> | null = null;

export function startDriftMonitor(intervalMs = 60_000): void {
  if (driftTimer) return;
  driftTimer = setInterval(() => {
    checkPerformanceDrift();
  }, intervalMs);
  console.log(`[DriftAlert] Performance drift monitor started (${intervalMs / 1000}s interval)`);
}

export function stopDriftMonitor(): void {
  if (driftTimer) {
    clearInterval(driftTimer);
    driftTimer = null;
  }
}
