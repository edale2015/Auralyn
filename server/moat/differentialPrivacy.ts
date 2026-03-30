/**
 * Recommendation #1 — Differential Privacy for Federated Cross-Clinic Learning
 *
 * Problem: The moat network learning aggregates raw encounter counts across
 * clinics. A clinic with a single ultra-rare patient is essentially identifiable
 * in the cross-clinic aggregate. An adversary querying before/after a rare case
 * is added can fingerprint the contributing clinic.
 *
 * Solution: Laplace mechanism (ε-differential privacy).
 *   - Sensitivity = 1 (each clinic contributes at most 1 to any count)
 *   - ε = 1.0 by default (strong privacy / moderate utility trade-off)
 *   - Noise is added to COUNT queries only — not stored — so raw data stays clean
 *
 * Usage:
 *   import { addDpNoise, dpProtect } from "./differentialPrivacy";
 *   const protectedCount = addDpNoise(rawCount);
 *   const protectedRecord = dpProtect(record, ["encounterCount", "rarePatternCount"]);
 */

const DEFAULT_EPSILON   = 1.0;  // privacy budget — lower = more private
const DEFAULT_SENSITIVITY = 1;  // global sensitivity for count queries

/**
 * Draw a sample from the Laplace distribution via inverse CDF.
 * scale = sensitivity / epsilon
 */
function laplaceSample(scale: number): number {
  const u = Math.random() - 0.5;
  return -scale * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
}

/**
 * Add calibrated Laplace noise to a raw count.
 * The returned value is rounded to the nearest integer and clamped ≥ 0.
 */
export function addDpNoise(
  value:       number,
  sensitivity: number = DEFAULT_SENSITIVITY,
  epsilon:     number = DEFAULT_EPSILON,
): number {
  const scale = sensitivity / epsilon;
  const noisy = value + laplaceSample(scale);
  return Math.max(0, Math.round(noisy));
}

/**
 * Apply differential privacy noise to specified numeric fields of a record.
 * Non-listed fields pass through untouched.
 */
export function dpProtect<T extends Record<string, any>>(
  record:      T,
  fields:      (keyof T)[],
  sensitivity: number = DEFAULT_SENSITIVITY,
  epsilon:     number = DEFAULT_EPSILON,
): T {
  const protected_: any = { ...record };
  for (const field of fields) {
    if (typeof record[field] === "number") {
      protected_[field] = addDpNoise(record[field] as number, sensitivity, epsilon);
    }
  }
  return protected_ as T;
}

/**
 * Privacy metadata for audit/transparency reporting.
 */
export function getDpMetadata(epsilon = DEFAULT_EPSILON) {
  return {
    mechanism:    "Laplace",
    epsilon,
    sensitivity:  DEFAULT_SENSITIVITY,
    scale:        DEFAULT_SENSITIVITY / epsilon,
    privacyLevel: epsilon <= 0.5 ? "strong" : epsilon <= 1.5 ? "moderate" : "low",
    note:         "Noise added to query outputs only — raw data is not modified",
  };
}
