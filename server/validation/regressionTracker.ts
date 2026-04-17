/**
 * server/validation/regressionTracker.ts
 * Clinical regression detection — compares validation snapshots over time.
 *
 * Called after every validation run to detect safety regressions:
 *   - Unsafe undercalls increasing (most critical)
 *   - Pass rate dropping
 *   - Calibration error worsening
 */

export type ValidationSnapshot = {
  unsafeUndercalls:  number;  // count of dangerous cases incorrectly triaged low
  passRate:          number;  // 0–1 fraction of cases passing all safety gates
  calibrationError:  number;  // mean calibration error (lower = better)
  timestamp?:        number;
};

export type RegressionResult = {
  unsafeIncrease:      boolean;
  passRateDrop:        boolean;
  calibrationWorsened: boolean;
  isRegression:        boolean;
  delta: {
    unsafeUndercalls:  number;
    passRate:          number;
    calibrationError:  number;
  };
};

/**
 * Detect regressions by comparing current vs previous validation run.
 * Returns a detailed delta so alerts can be specific.
 */
export function detectRegressions(
  prev:    ValidationSnapshot,
  current: ValidationSnapshot
): RegressionResult {
  const unsafeIncrease      = current.unsafeUndercalls > prev.unsafeUndercalls;
  const passRateDrop        = current.passRate        < prev.passRate - 0.005;  // 0.5% tolerance
  const calibrationWorsened = current.calibrationError > prev.calibrationError * 1.05;  // 5% tolerance

  return {
    unsafeIncrease,
    passRateDrop,
    calibrationWorsened,
    isRegression: unsafeIncrease || passRateDrop || calibrationWorsened,
    delta: {
      unsafeUndercalls: current.unsafeUndercalls - prev.unsafeUndercalls,
      passRate:         current.passRate          - prev.passRate,
      calibrationError: current.calibrationError  - prev.calibrationError,
    },
  };
}

/**
 * Build human-readable alert messages from a regression result.
 */
export function buildRegressionAlerts(reg: RegressionResult): string[] {
  const alerts: string[] = [];

  if (reg.unsafeIncrease) {
    alerts.push(
      `🚨 UNSAFE UNDERCALLS INCREASED by ${reg.delta.unsafeUndercalls} — immediate review required`
    );
  }
  if (reg.passRateDrop) {
    const pct = (Math.abs(reg.delta.passRate) * 100).toFixed(1);
    alerts.push(`⚠ PASS RATE dropped by ${pct}%`);
  }
  if (reg.calibrationWorsened) {
    alerts.push(`⚠ CALIBRATION ERROR worsened by ${reg.delta.calibrationError.toFixed(4)}`);
  }

  return alerts;
}
