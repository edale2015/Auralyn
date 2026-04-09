/**
 * Clinical Drift Detector
 *
 * Detects when the system is slowly becoming wrong before performance visibly
 * collapses. Clinical drift happens when the patient population shifts (e.g.,
 * seasonal flu wave increases ER presentations) but the model's baseline
 * expectations haven't updated.
 *
 * The detector compares current ER referral rates against a historical baseline.
 * Drift > 5% triggers an alert and a recommendation — not an automatic change.
 * All responses go through the golden case gate before application.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface OutcomeSnapshot {
  actualOutcome:        string;
  predictedDisposition: string;
  complaint?:           string;
  ageGroup?:            string;
  ts?:                  number;
}

export interface DriftReport {
  driftDetected:    boolean;
  driftMagnitude:   number;    // current ER rate − baseline ER rate
  currentErRate:    number;
  baselineErRate:   number;
  recommendation:   string;
  severity:         "none" | "warning" | "critical";
  sampleSize:       number;
}

// ── Configurable baselines ────────────────────────────────────────────────────
// These should be tuned per clinic from historical data.

const DEFAULT_BASELINE_ER_RATE = 0.12;  // 12% historical ER referral rate
const DRIFT_WARNING_THRESHOLD  = 0.05;  // 5% drift = warning
const DRIFT_CRITICAL_THRESHOLD = 0.10;  // 10% drift = critical

// ── Engine ────────────────────────────────────────────────────────────────────

/**
 * Detect clinical drift from a set of recent outcome records.
 *
 * @param outcomes  Recent outcomes — should be last 7–30 days for meaningful signal.
 * @param baselineErRate  Historical ER rate for this clinic (default 12%).
 */
export function detectClinicalDrift(
  outcomes:       OutcomeSnapshot[],
  baselineErRate = DEFAULT_BASELINE_ER_RATE
): DriftReport {
  if (!outcomes.length) {
    return {
      driftDetected:  false,
      driftMagnitude: 0,
      currentErRate:  baselineErRate,
      baselineErRate,
      recommendation: "Insufficient outcome data for drift analysis",
      severity:       "none",
      sampleSize:     0,
    };
  }

  const currentErRate =
    outcomes.filter(o => o.actualOutcome === "ER_NOW").length / outcomes.length;

  const drift = currentErRate - baselineErRate;
  const absDrift = Math.abs(drift);

  let severity: DriftReport["severity"] = "none";
  let driftDetected = false;
  let recommendation = `ER rate (${(currentErRate * 100).toFixed(1)}%) within expected range of baseline (${(baselineErRate * 100).toFixed(1)}%).`;

  if (absDrift >= DRIFT_CRITICAL_THRESHOLD) {
    severity       = "critical";
    driftDetected  = true;
    recommendation = drift > 0
      ? `ER rate elevated by ${(drift * 100).toFixed(1)}% above baseline — increase safety pipeline sensitivity or review triage rules. Validate with golden cases.`
      : `ER rate decreased by ${(absDrift * 100).toFixed(1)}% below baseline — potential increase in false negatives. Review safety thresholds.`;
  } else if (absDrift >= DRIFT_WARNING_THRESHOLD) {
    severity       = "warning";
    driftDetected  = true;
    recommendation = drift > 0
      ? `Moderate upward drift — increase sensitivity; validate before deployment.`
      : `Moderate downward drift — risk of over-routing to routine. Monitor closely.`;
  }

  return {
    driftDetected,
    driftMagnitude: drift,
    currentErRate,
    baselineErRate,
    recommendation,
    severity,
    sampleSize: outcomes.length,
  };
}
