# Validation Discipline

## Review Prompt

Review this validation system.
Focus on:
  - Whether unsafe cases can slip through testing
  - Weaknesses in adversarial case generation
  - Missing failure scenarios (sepsis, PE, ACS, stroke)
  - Calibration flaws that could mask confidence errors
  - Whether the validation gate threshold is appropriately conservative

## Files

---

### Final Meta Question (ask after reviewing)

List the **TOP 5 MOST DANGEROUS FAILURE MODES** in this section.
Be specific. Do not give generic advice. Focus on real-world clinical risk.

### server/validation/goldenCaseHarness.ts

```ts
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
```

### server/validation/adversarialGenerator.ts

```ts
/**
 * Adversarial case generator.
 *
 * Creates brittle, sparse, contradictory, and omission-heavy variants
 * from a set of base golden cases to stress-test the diagnosis engine
 * beyond well-formed inputs.
 */

import { GoldenCase } from "./goldenCaseTypes";

/** Return only the first ⌊n/2⌋ observations (minimum 1). */
export function generateSparseVariant(base: GoldenCase): GoldenCase {
  return {
    ...base,
    id:           `${base.id}__sparse`,
    title:        `${base.title} [Sparse]`,
    observations: base.observations.slice(0, Math.max(1, Math.floor(base.observations.length / 2))),
  };
}

/** Append a physiologically impossible contradiction marker. */
export function generateContradictoryVariant(base: GoldenCase): GoldenCase {
  return {
    ...base,
    id:           `${base.id}__contradictory`,
    title:        `${base.title} [Contradictory]`,
    observations: [...base.observations, { feature: "contradiction_marker", value: true }],
  };
}

/** Remove one critical feature from observations. */
export function generateMissingCriticalVariant(
  base:           GoldenCase,
  missingFeature: string,
): GoldenCase {
  return {
    ...base,
    id:           `${base.id}__missing_${missingFeature}`,
    title:        `${base.title} [Missing ${missingFeature}]`,
    observations: base.observations.filter((o) => o.feature !== missingFeature),
  };
}

/** Negate every boolean observation (present → absent). */
export function generateNegatedVariant(base: GoldenCase): GoldenCase {
  return {
    ...base,
    id:           `${base.id}__negated`,
    title:        `${base.title} [Negated]`,
    observations: base.observations.map((o) => ({
      ...o,
      value: typeof o.value === "boolean" ? !o.value : o.value,
    })),
  };
}

/**
 * Expand a seed set into 4× variants:
 *  original + sparse + contradictory + missing-first-feature
 */
export function expandAdversarialSet(baseCases: GoldenCase[]): GoldenCase[] {
  const out: GoldenCase[] = [];

  for (const c of baseCases) {
    out.push(c);
    out.push(generateSparseVariant(c));
    out.push(generateContradictoryVariant(c));
    if (c.observations[0]?.feature) {
      out.push(generateMissingCriticalVariant(c, c.observations[0].feature));
    }
  }

  return out;
}
```

### server/validation/validationRunner.ts

```ts
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
```

### server/validation/validationGate.ts

```ts
/**
 * Validation gate — blocks deployment / feature activation when safety
 * thresholds are not met.
 *
 * Use before:
 *   • Deploying KB updates
 *   • Enabling new complaint logic
 *   • Allowing autonomous disposition
 */

import { ValidationSummary } from "./goldenCaseTypes";

export type ValidationGateResult = {
  allowed: boolean;
  errors:  string[];
};

const PASS_RATE_MINIMUM      = 0.85;
const CALIBRATION_ERROR_MAX  = 0.15;

export function enforceValidationGate(
  summary: ValidationSummary & { calibrationError?: number },
): ValidationGateResult {
  const errors: string[] = [];

  if (summary.unsafeUndercalls > 0) {
    errors.push(
      `Unsafe undercalls detected (${summary.unsafeUndercalls}) — deployment blocked`,
    );
  }

  if (summary.passRate < PASS_RATE_MINIMUM) {
    errors.push(
      `Pass rate ${(summary.passRate * 100).toFixed(1)}% below minimum ${PASS_RATE_MINIMUM * 100}%`,
    );
  }

  if (
    summary.calibrationError !== undefined &&
    summary.calibrationError > CALIBRATION_ERROR_MAX
  ) {
    errors.push(
      `Model overconfidence detected — Brier score ${summary.calibrationError.toFixed(3)} > ${CALIBRATION_ERROR_MAX}`,
    );
  }

  return { allowed: errors.length === 0, errors };
}

/**
 * Runtime kill switch — disables AI autonomy when unsafe outcomes are detected.
 */
export function runtimeSafetyCheck(summary: ValidationSummary): {
  allowAutonomy:         boolean;
  forcePhysicianReview:  boolean;
  reason?:               string;
} {
  if (summary.unsafeUndercalls > 0) {
    return {
      allowAutonomy:        false,
      forcePhysicianReview: true,
      reason:               "Unsafe validation detected — physician review forced",
    };
  }

  return { allowAutonomy: true, forcePhysicianReview: false };
}

/**
 * Drift alert between consecutive validation runs.
 */
export function detectValidationDrift(
  previous: ValidationSummary,
  current:  ValidationSummary,
): { drift: number; alert: boolean } {
  const drift = Math.abs(current.passRate - previous.passRate);
  return { drift, alert: drift > 0.1 };
}
```

### server/validation/calibrationMonitor.ts

```ts
/**
 * Calibration monitor — detects over-confidence patterns.
 *
 * The Brier score is the mean squared error between predicted
 * probability and the binary correctness outcome.
 *
 *   BS = (1/N) Σ (p̂ᵢ − yᵢ)²
 *
 * A perfectly calibrated model has BS ≈ 0; random guessing ≈ 0.25.
 */

export type CalibrationRow = {
  predictedConfidence: number;
  correct:             boolean;
};

/** Mean squared error between predicted confidence and outcome. */
export function computeBrierScore(rows: CalibrationRow[]): number {
  if (!rows.length) return 0;

  return (
    rows.reduce((sum, r) => {
      const y = r.correct ? 1 : 0;
      return sum + Math.pow(r.predictedConfidence - y, 2);
    }, 0) / rows.length
  );
}

export type CalibrationBucket = {
  bucket:         string;
  avgConfidence:  number;
  accuracy:       number;
  count:          number;
};

/** Group rows into buckets of width bucketSize and compute per-bucket stats. */
export function bucketCalibration(
  rows:       CalibrationRow[],
  bucketSize = 0.1,
): CalibrationBucket[] {
  const buckets: CalibrationBucket[] = [];

  for (let start = 0; start < 1; start += bucketSize) {
    const end      = start + bucketSize;
    const inBucket = rows.filter(
      (r) => r.predictedConfidence >= start && r.predictedConfidence < end,
    );
    if (!inBucket.length) continue;

    const avgConfidence =
      inBucket.reduce((a, b) => a + b.predictedConfidence, 0) / inBucket.length;
    const accuracy = inBucket.filter((r) => r.correct).length / inBucket.length;

    buckets.push({
      bucket: `${start.toFixed(1)}-${end.toFixed(1)}`,
      avgConfidence,
      accuracy,
      count: inBucket.length,
    });
  }

  return buckets;
}

/** Flag buckets where confidence exceeds accuracy by ≥ 0.15 (and n ≥ 10). */
export function detectOverconfidence(
  rows: CalibrationRow[],
): Array<CalibrationBucket & { flag: "overconfident" }> {
  return bucketCalibration(rows)
    .filter((b) => b.avgConfidence - b.accuracy >= 0.15 && b.count >= 10)
    .map((b) => ({ ...b, flag: "overconfident" as const }));
}
```
