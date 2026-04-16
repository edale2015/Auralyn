/**
 * Full validation runner.
 *
 * 1. Expands adversarial variants from the base case set
 * 2. Runs every case through the golden harness
 * 3. Computes Brier-score calibration
 * 4. Returns a summary consumable by the validation gate and dashboard
 */

import { GoldenCase, ValidationSummary } from "./goldenCaseTypes";
import { runGoldenCases, summarizeValidation } from "./goldenCaseHarness";
import { expandAdversarialSet }  from "./adversarialGenerator";
import { computeBrierScore, CalibrationRow } from "./calibrationMonitor";

export interface FullValidationResult extends ValidationSummary {
  calibrationError: number;
  expandedCaseCount: number;
}

/**
 * Run a full validation cycle including adversarial expansion and calibration.
 *
 * @param cases   seed golden cases
 * @param runFn   engine function compatible with goldenCaseHarness
 */
export async function runFullValidation(
  cases: GoldenCase[],
  runFn: (gc: GoldenCase) => Promise<{ disposition: string; topDiagnosis?: string; confidence?: number }>,
): Promise<FullValidationResult> {
  const expanded = expandAdversarialSet(cases);
  const results  = await runGoldenCases(expanded, runFn);
  const summary  = summarizeValidation(results);

  const calibrationRows: CalibrationRow[] = results.map((r) => ({
    predictedConfidence: 0.7,   // plug real confidence when engine exposes it
    correct:             r.pass,
  }));

  const calibrationError = computeBrierScore(calibrationRows);

  return {
    ...summary,
    calibrationError,
    expandedCaseCount: expanded.length,
  };
}
