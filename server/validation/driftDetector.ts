/**
 * Clinical Model Drift Detector
 * Monitors for distributional shift between baseline performance metrics
 * and current performance. Triggers alerts when drift exceeds configurable thresholds.
 */

export interface DriftReport {
  metricName: string;
  baselineAvg: number;
  currentAvg: number;
  absoluteDrift: number;
  relativeDrift: number;
  alert: boolean;
  severity: "OK" | "WARNING" | "ALERT";
}

export interface MultiMetricDrift {
  reports: DriftReport[];
  anyAlert: boolean;
  criticalAlerts: DriftReport[];
}

/**
 * Detects drift between a baseline and current metric series.
 * @param baseline  Historical metric values (e.g., daily sensitivity scores)
 * @param current   Recent metric values to compare
 * @param threshold Absolute drift threshold to trigger an alert (default 0.05 = 5pp)
 */
export function detectDrift(
  baseline: number[],
  current: number[],
  metricName = "metric",
  threshold = 0.05
): DriftReport {
  if (!baseline.length || !current.length) {
    return {
      metricName,
      baselineAvg: 0,
      currentAvg: 0,
      absoluteDrift: 0,
      relativeDrift: 0,
      alert: false,
      severity: "OK",
    };
  }

  const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;

  const baselineAvg    = avg(baseline);
  const currentAvg     = avg(current);
  const absoluteDrift  = Math.abs(currentAvg - baselineAvg);
  const relativeDrift  = baselineAvg !== 0 ? absoluteDrift / baselineAvg : 0;

  const alert    = absoluteDrift > threshold;
  const severity = absoluteDrift > threshold * 2 ? "ALERT"
                 : absoluteDrift > threshold      ? "WARNING"
                 : "OK";

  return { metricName, baselineAvg, currentAvg, absoluteDrift, relativeDrift, alert, severity };
}

export function detectMultiMetricDrift(
  metrics: Array<{ name: string; baseline: number[]; current: number[]; threshold?: number }>
): MultiMetricDrift {
  const reports = metrics.map(m =>
    detectDrift(m.baseline, m.current, m.name, m.threshold ?? 0.05)
  );
  const criticalAlerts = reports.filter(r => r.severity === "ALERT");
  return {
    reports,
    anyAlert: reports.some(r => r.alert),
    criticalAlerts,
  };
}
