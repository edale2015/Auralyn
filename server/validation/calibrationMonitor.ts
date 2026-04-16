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
