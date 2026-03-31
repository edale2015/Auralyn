/**
 * Drift Tracker
 *
 * Monitors clinical system accuracy over time.
 * Records snapshots after each simulation run and detects degradation.
 *
 * Alert levels:
 *   watchlist  — accuracy dropped >3% from baseline
 *   warning    — accuracy dropped >7% from baseline
 *   critical   — accuracy dropped >15% from baseline
 *   false_reassurance — false reassurance rate >5%
 */

import { logAuditEvent } from "../governance/changeAuditLog";

export type DriftAlertLevel = "watchlist" | "warning" | "critical" | "resolved";

export interface DriftSnapshot {
  snapshotId:           string;
  timestamp:            number;
  isoTime:              string;
  simRunId?:            string;
  complaint?:           string;
  accuracy:             number;
  safetyAccuracy:       number;
  falseReassuranceRate: number;
  er_now_sensitivity:   number;
  avgConfidence:        number;
  totalCases:           number;
}

export interface DriftAlert {
  alertId:       string;
  level:         DriftAlertLevel;
  metric:        string;
  baselineValue: number;
  currentValue:  number;
  delta:         number;
  triggeredAt:   number;
  resolvedAt?:   number;
  detail:        string;
}

const snapshots: DriftSnapshot[] = [];
const alerts: DriftAlert[] = [];
const MAX_SNAPSHOTS = 500;
let baseline: DriftSnapshot | null = null;

function uid(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

export function recordDriftSnapshot(data: Omit<DriftSnapshot, "snapshotId" | "timestamp" | "isoTime">): DriftSnapshot {
  const now = Date.now();
  const snap: DriftSnapshot = {
    ...data,
    snapshotId: uid("drift"),
    timestamp:  now,
    isoTime:    new Date(now).toISOString(),
  };
  snapshots.unshift(snap);
  if (snapshots.length > MAX_SNAPSHOTS) snapshots.splice(MAX_SNAPSHOTS);
  if (!baseline) baseline = snap;
  detectDrift(snap);
  return snap;
}

function detectDrift(snap: DriftSnapshot): void {
  if (!baseline) return;
  checkMetric("accuracy",             snap.accuracy,             baseline.accuracy,         0.03, 0.07, 0.15);
  checkMetric("safetyAccuracy",       snap.safetyAccuracy,       baseline.safetyAccuracy,   0.02, 0.05, 0.10);
  checkMetric("er_now_sensitivity",   snap.er_now_sensitivity,   baseline.er_now_sensitivity, 0.03, 0.07, 0.12);
  if (snap.falseReassuranceRate > 0.05) {
    raiseAlert("critical", "falseReassuranceRate", 0, snap.falseReassuranceRate, snap.falseReassuranceRate,
      `False reassurance rate ${(snap.falseReassuranceRate * 100).toFixed(1)}% exceeds 5% safety threshold`);
  }
}

function checkMetric(name: string, current: number, base: number, watchThresh: number, warnThresh: number, critThresh: number): void {
  const delta = base - current;
  if (delta >= critThresh)   raiseAlert("critical",   name, base, current, delta, `${name} dropped ${(delta * 100).toFixed(1)}% from baseline`);
  else if (delta >= warnThresh) raiseAlert("warning",  name, base, current, delta, `${name} dropped ${(delta * 100).toFixed(1)}% from baseline`);
  else if (delta >= watchThresh) raiseAlert("watchlist", name, base, current, delta, `${name} dropped ${(delta * 100).toFixed(1)}% — monitoring`);
}

function raiseAlert(level: DriftAlertLevel, metric: string, baseVal: number, curVal: number, delta: number, detail: string): void {
  const existing = alerts.find(a => a.metric === metric && !a.resolvedAt);
  if (existing) {
    existing.level        = level;
    existing.currentValue = curVal;
    existing.delta        = delta;
    existing.detail       = detail;
    return;
  }
  const alert: DriftAlert = {
    alertId:       uid("alert"),
    level,
    metric,
    baselineValue: baseVal,
    currentValue:  curVal,
    delta,
    triggeredAt:   Date.now(),
    detail,
  };
  alerts.unshift(alert);
  if (level === "critical" || level === "warning") {
    logAuditEvent({
      action:  "drift_alert_triggered",
      source:  "system",
      detail:  `${level.toUpperCase()}: ${detail}`,
      after:   { metric, current: curVal, baseline: baseVal, delta },
    });
  }
}

export function setBaseline(snapId?: string): boolean {
  const snap = snapId ? snapshots.find(s => s.snapshotId === snapId) : snapshots[0];
  if (!snap) return false;
  baseline = snap;
  return true;
}

export function getDriftTimeline(complaint?: string, limit = 30): DriftSnapshot[] {
  return (complaint ? snapshots.filter(s => s.complaint === complaint) : snapshots).slice(0, limit);
}

export function getActiveAlerts(): DriftAlert[] {
  return alerts.filter(a => !a.resolvedAt);
}

export function getAllAlerts(limit = 50): DriftAlert[] {
  return alerts.slice(0, limit);
}

export function resolveAlert(alertId: string): boolean {
  const alert = alerts.find(a => a.alertId === alertId);
  if (!alert) return false;
  alert.resolvedAt = Date.now();
  alert.level      = "resolved";
  return true;
}

export function getDriftStats(): {
  totalSnapshots: number;
  activeAlerts: number;
  criticalAlerts: number;
  baselineAccuracy: number;
  latestAccuracy: number;
  accuracyTrend: "improving" | "stable" | "degrading";
} {
  const latest  = snapshots[0];
  const base    = baseline;
  const active  = alerts.filter(a => !a.resolvedAt);
  const recent  = snapshots.slice(0, 5).map(s => s.accuracy);
  const trend   = recent.length >= 3
    ? (recent[0] > recent[recent.length - 1] + 0.01 ? "improving"
      : recent[0] < recent[recent.length - 1] - 0.01 ? "degrading"
      : "stable")
    : "stable";
  return {
    totalSnapshots:   snapshots.length,
    activeAlerts:     active.length,
    criticalAlerts:   active.filter(a => a.level === "critical").length,
    baselineAccuracy: base?.accuracy ?? 0,
    latestAccuracy:   latest?.accuracy ?? 0,
    accuracyTrend:    trend,
  };
}
