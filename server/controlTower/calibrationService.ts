/**
 * Per-complaint calibration service.
 *
 * Tracks confidence vs accuracy per complaint category so the control
 * tower can surface where the model is systematically over/under confident.
 */

export interface CalibrationResultRow {
  complaint:    string;
  confidence:   number;
  correct:      boolean;
}

export interface ComplaintCalibration {
  avgConfidence: number;
  accuracy:      number;
  gap:           number;           // positive = overconfident
  count:         number;
}

/**
 * Group calibration rows by complaint and compute per-complaint stats.
 */
export function calibrationByComplaint(
  results: CalibrationResultRow[],
): Record<string, ComplaintCalibration> {
  const map: Record<string, CalibrationResultRow[]> = {};

  for (const r of results) {
    if (!map[r.complaint]) map[r.complaint] = [];
    map[r.complaint].push(r);
  }

  const output: Record<string, ComplaintCalibration> = {};

  for (const complaint in map) {
    const rows = map[complaint];

    const avgConfidence =
      rows.reduce((a, b) => a + b.confidence, 0) / rows.length;
    const accuracy = rows.filter((r) => r.correct).length / rows.length;

    output[complaint] = {
      avgConfidence,
      accuracy,
      gap:   avgConfidence - accuracy,
      count: rows.length,
    };
  }

  return output;
}

/**
 * Flag complaints where the model is significantly overconfident.
 * Threshold: gap ≥ 0.15 and at least 10 samples.
 */
export function flagOverconfidentComplaints(
  calibration: Record<string, ComplaintCalibration>,
  gapThreshold = 0.15,
  minCount     = 10,
): string[] {
  return Object.entries(calibration)
    .filter(([, c]) => c.gap >= gapThreshold && c.count >= minCount)
    .map(([complaint]) => complaint);
}
