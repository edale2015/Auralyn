/**
 * Safety Regression Watchdog
 *
 * Prevents silent safety degradation between deployments or KB updates.
 *
 * The invariant this enforces: safety performance can only improve or stay
 * the same, never regress. A new deployment that produces more safety
 * mismatches than the previous one is automatically blocked.
 *
 * This pairs with the golden case engine — the watchdog compares snapshots,
 * the golden case engine gates individual changes.
 *
 * "Never allow silent degradation" means: this check runs on every deployment
 * and every scheduled simulation run, not just on manual change requests.
 */

import { type SimulationResult } from "../simulation/goldenCaseEngine";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface WatchdogSnapshot {
  snapshotId:        string;
  capturedAt:        string;
  safetyMismatches:  number;
  accuracyRate:      number;
  totalCases:        number;
}

export interface WatchdogResult {
  passed:            boolean;
  reason:            string;
  mismatchDelta:     number;   // current − previous (positive = regression)
  accuracyDelta:     number;   // current − previous (negative = regression)
}

// ── Watchdog ──────────────────────────────────────────────────────────────────

/**
 * Compare two simulation snapshots and throw if the current one is worse.
 *
 * Any increase in safety mismatches is a hard failure — no tolerance.
 * An accuracy drop > 2% is also a failure (allows for natural variance).
 */
export function safetyRegressionCheck(
  previous: Pick<SimulationResult, "safetyMismatches" | "accuracyRate" | "totalCases">,
  current:  Pick<SimulationResult, "safetyMismatches" | "accuracyRate" | "totalCases">
): WatchdogResult {
  const mismatchDelta = current.safetyMismatches - previous.safetyMismatches;
  const accuracyDelta = current.accuracyRate      - previous.accuracyRate;

  if (mismatchDelta > 0) {
    throw new Error(
      `CRITICAL: Safety regression detected — ` +
      `${current.safetyMismatches} safety mismatches (previously ${previous.safetyMismatches}, ` +
      `delta: +${mismatchDelta}). Deployment blocked.`
    );
  }

  const ACCURACY_TOLERANCE = 0.02;  // allow ±2% natural variance
  if (accuracyDelta < -ACCURACY_TOLERANCE) {
    throw new Error(
      `QUALITY: Accuracy regression detected — ` +
      `${(current.accuracyRate * 100).toFixed(1)}% vs previous ${(previous.accuracyRate * 100).toFixed(1)}% ` +
      `(delta: ${(accuracyDelta * 100).toFixed(1)}%). Exceeds tolerance of ${(ACCURACY_TOLERANCE * 100).toFixed(0)}%.`
    );
  }

  return {
    passed:        true,
    reason:        `Safety and accuracy within bounds (mismatches: ${current.safetyMismatches}, accuracy: ${(current.accuracyRate * 100).toFixed(1)}%)`,
    mismatchDelta,
    accuracyDelta,
  };
}

/**
 * Convert a SimulationResult into a storable watchdog snapshot.
 */
export function toWatchdogSnapshot(result: SimulationResult, snapshotId?: string): WatchdogSnapshot {
  return {
    snapshotId:       snapshotId ?? `snap-${Date.now()}`,
    capturedAt:       new Date().toISOString(),
    safetyMismatches: result.safetyMismatches,
    accuracyRate:     result.accuracyRate,
    totalCases:       result.totalCases,
  };
}
