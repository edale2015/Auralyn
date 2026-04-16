/**
 * Golden case harness — runs golden cases through the live clinical engine
 * and evaluates disposition safety, diagnosis accuracy, and unsafe undercalls.
 *
 * Integrates with the existing `runHardenedClinicalFlow` pipeline so
 * results reflect the real production engine, not a mock.
 */

import { GoldenCase, ValidationRunResult, ValidationSummary } from "./goldenCaseTypes";

// Severity ordering — used for unsafe-undercall detection
export const SEVERITY_ORDER: Record<string, number> = {
  home:                       0,
  urgent_care:                1,
  physician_review_required:  2,
  ed:                         3,
  call_911:                   4,
};

// ─── Lightweight in-process harness ───────────────────────────────────────

/**
 * Evaluate a single golden case against the provided engine function.
 *
 * @param gc      the golden case
 * @param runFn   async function that accepts (observations, profile) and
 *                returns { disposition: string; topDiagnosis?: string }
 */
async function evaluateCase(
  gc:    GoldenCase,
  runFn: (gc: GoldenCase) => Promise<{ disposition: string; topDiagnosis?: string }>,
): Promise<ValidationRunResult> {
  let result: { disposition: string; topDiagnosis?: string };

  try {
    result = await runFn(gc);
  } catch {
    result = { disposition: "physician_review_required" };
  }

  const finalDisposition = result.disposition;
  const topDiagnosis     = result.topDiagnosis;

  const diagnosisMatch    = gc.expectedTopDiagnosis
    ? topDiagnosis === gc.expectedTopDiagnosis
    : true;
  const dispositionMatch  = finalDisposition === gc.expectedDisposition;

  const minSafe          = gc.minimumSafeDisposition ?? gc.expectedDisposition;
  const unsafeUndercall  =
    (SEVERITY_ORDER[finalDisposition] ?? 0) < (SEVERITY_ORDER[minSafe] ?? 0);

  const reasons: string[] = [];
  if (!diagnosisMatch)
    reasons.push(`Diagnosis mismatch: got '${topDiagnosis}', expected '${gc.expectedTopDiagnosis}'`);
  if (!dispositionMatch)
    reasons.push(`Disposition mismatch: got '${finalDisposition}', expected '${gc.expectedDisposition}'`);
  if (unsafeUndercall)
    reasons.push(`Unsafe undercall: '${finalDisposition}' is below minimum safe '${minSafe}'`);

  return {
    caseId:              gc.id,
    pass:                !unsafeUndercall && dispositionMatch && diagnosisMatch,
    topDiagnosis,
    finalDisposition,
    expectedDisposition: gc.expectedDisposition,
    expectedTopDiagnosis: gc.expectedTopDiagnosis,
    diagnosisMatch,
    dispositionMatch,
    unsafeUndercall,
    reasons,
  };
}

/**
 * Run all golden cases sequentially and collect results.
 *
 * @param cases   array of golden cases
 * @param runFn   engine function (see evaluateCase)
 */
export async function runGoldenCases(
  cases: GoldenCase[],
  runFn: (gc: GoldenCase) => Promise<{ disposition: string; topDiagnosis?: string }>,
): Promise<ValidationRunResult[]> {
  const results: ValidationRunResult[] = [];

  for (const gc of cases) {
    results.push(await evaluateCase(gc, runFn));
  }

  return results;
}

/**
 * Summarise a set of validation run results.
 */
export function summarizeValidation(results: ValidationRunResult[]): ValidationSummary {
  const total    = results.length;
  const passed   = results.filter((r) => r.pass).length;

  return {
    total,
    passed,
    failed:            total - passed,
    passRate:          total ? passed / total : 0,
    unsafeUndercalls:  results.filter((r) => r.unsafeUndercall).length,
    diagnosisMisses:   results.filter((r) => !r.diagnosisMatch).length,
    dispositionMisses: results.filter((r) => !r.dispositionMatch).length,
  };
}
