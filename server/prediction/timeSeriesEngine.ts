/**
 * server/prediction/timeSeriesEngine.ts
 * Time-series Bayesian deterioration model — trend-aware risk scoring.
 *
 * Unlike single-snapshot scoring, this detects TRAJECTORY:
 *   - Rising HR trend → early sepsis signal
 *   - Falling BP trend → shock progression
 *   - Falling SpO₂ trend → respiratory failure
 */

export type VitalHistory = {
  hr:   number[];
  bp:   number[];
  spo2: number[];
  temp?: number[];
  rr?:  number[];
};

export type TrendRiskResult = {
  score:        number;    // 0–1
  trending:     boolean;
  hrTrend:      number;    // +/- bpm change over window
  bpTrend:      number;    // +/- mmHg change over window
  spo2Trend:    number;    // +/- % change over window
  pattern:      string;    // human-readable pattern name
  alert:        string | null;
};

// ── Linear slope over a window of values ─────────────────────────────────────

function slope(arr: number[]): number {
  if (arr.length < 2) return 0;
  const n  = arr.length;
  const x̄  = (n - 1) / 2;
  const ȳ  = arr.reduce((s, v) => s + v, 0) / n;
  let num = 0; let den = 0;
  arr.forEach((y, i) => {
    num += (i - x̄) * (y - ȳ);
    den += (i - x̄) ** 2;
  });
  return den === 0 ? 0 : num / den;
}

/**
 * Compute risk from vital sign history (minimum 2 data points required).
 * Returns the full trend breakdown so it can be displayed on the wall display.
 */
export function computeTrendRisk(history: VitalHistory): TrendRiskResult {
  if (!history.hr.length || !history.bp.length || !history.spo2.length) {
    return { score: 0, trending: false, hrTrend: 0, bpTrend: 0, spo2Trend: 0, pattern: "insufficient data", alert: null };
  }

  const hrSlope   = slope(history.hr);
  const bpSlope   = slope(history.bp);
  const spo2Slope = slope(history.spo2);

  // ── Deterioration scoring ─────────────────────────────────────────────────

  let score = 0;
  const patterns: string[] = [];

  if (hrSlope > 5) {
    score += 0.30;
    patterns.push("Rising HR");
  }
  if (bpSlope < -5) {
    score += 0.40;
    patterns.push("Falling BP");
  }
  if (spo2Slope < -1) {
    score += 0.35;
    patterns.push("Falling SpO₂");
  }

  // Combined sepsis trajectory: HR rising + BP falling
  if (hrSlope > 3 && bpSlope < -3) {
    score += 0.20;
    patterns.push("Sepsis trajectory (HR↑ + BP↓)");
  }

  // Respiratory collapse: SpO₂ falling + HR rising
  if (spo2Slope < -1.5 && hrSlope > 3) {
    score += 0.20;
    patterns.push("Respiratory decompensation");
  }

  score = Math.min(score, 1);
  const trending = score > 0.4;

  let alert: string | null = null;
  if (score > 0.7)      alert = "CRITICAL — Rapid deterioration trend";
  else if (score > 0.4) alert = "WARNING — Worsening vital trend";

  return {
    score,
    trending,
    hrTrend:   hrSlope,
    bpTrend:   bpSlope,
    spo2Trend: spo2Slope,
    pattern:   patterns.join(", ") || "stable",
    alert,
  };
}

/**
 * Append a new reading to a VitalHistory object (in-place, capped at maxWindow).
 */
export function appendVitals(
  history:   VitalHistory,
  vitals:    { hr: number; bp: number; spo2: number; temp?: number; rr?: number },
  maxWindow  = 10
): VitalHistory {
  const push = <T>(arr: T[], val: T) => [...arr, val].slice(-maxWindow);
  return {
    hr:   push(history.hr,   vitals.hr),
    bp:   push(history.bp,   vitals.bp),
    spo2: push(history.spo2, vitals.spo2),
    temp: history.temp ? push(history.temp, vitals.temp ?? history.temp[history.temp.length - 1]) : undefined,
    rr:   history.rr   ? push(history.rr,   vitals.rr   ?? history.rr[history.rr.length - 1])     : undefined,
  };
}
