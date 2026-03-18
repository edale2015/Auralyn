export type CalibrationRow = {
  complaint: string;
  rawConfidence: number;
  wasCorrect: boolean;
};

export type ComplaintCalibration = {
  complaint: string;
  empiricalAccuracy: number;
  avgRawConfidence: number;
  adjustment: number;
};

export function buildComplaintCalibration(rows: CalibrationRow[]): ComplaintCalibration[] {
  const map: Record<string, { total: number; correct: number; confidenceSum: number }> = {};

  for (const row of rows) {
    if (!map[row.complaint]) map[row.complaint] = { total: 0, correct: 0, confidenceSum: 0 };
    map[row.complaint].total += 1;
    map[row.complaint].confidenceSum += row.rawConfidence;
    if (row.wasCorrect) map[row.complaint].correct += 1;
  }

  return Object.entries(map).map(([complaint, v]) => {
    const empiricalAccuracy = v.total ? v.correct / v.total : 0;
    const avgRawConfidence = v.total ? v.confidenceSum / v.total : 0;
    const adjustment = empiricalAccuracy - avgRawConfidence;

    return {
      complaint,
      empiricalAccuracy: Number(empiricalAccuracy.toFixed(3)),
      avgRawConfidence: Number(avgRawConfidence.toFixed(3)),
      adjustment: Number(adjustment.toFixed(3)),
    };
  });
}

export function calibrateConfidence(complaint: string, rawConfidence: number, calibrations: ComplaintCalibration[]) {
  const hit = calibrations.find((c) => c.complaint === complaint);
  if (!hit) {
    return { complaint, rawConfidence, calibratedConfidence: rawConfidence, source: "no_calibration" };
  }
  const calibrated = Math.max(0, Math.min(1, rawConfidence + hit.adjustment));
  return { complaint, rawConfidence, calibratedConfidence: Number(calibrated.toFixed(3)), source: "complaint_calibration" };
}

const seededCalibrationRows: CalibrationRow[] = [
  { complaint: "cough", rawConfidence: 0.85, wasCorrect: true },
  { complaint: "cough", rawConfidence: 0.82, wasCorrect: true },
  { complaint: "cough", rawConfidence: 0.88, wasCorrect: true },
  { complaint: "cough", rawConfidence: 0.79, wasCorrect: false },
  { complaint: "cough", rawConfidence: 0.9, wasCorrect: true },
  { complaint: "urinary burning", rawConfidence: 0.84, wasCorrect: true },
  { complaint: "urinary burning", rawConfidence: 0.8, wasCorrect: true },
  { complaint: "urinary burning", rawConfidence: 0.78, wasCorrect: false },
  { complaint: "urinary burning", rawConfidence: 0.86, wasCorrect: true },
  { complaint: "rash", rawConfidence: 0.7, wasCorrect: false },
  { complaint: "rash", rawConfidence: 0.65, wasCorrect: false },
  { complaint: "rash", rawConfidence: 0.72, wasCorrect: true },
  { complaint: "rash", rawConfidence: 0.68, wasCorrect: false },
  { complaint: "sore throat", rawConfidence: 0.75, wasCorrect: true },
  { complaint: "sore throat", rawConfidence: 0.78, wasCorrect: true },
  { complaint: "sore throat", rawConfidence: 0.72, wasCorrect: false },
  { complaint: "abdominal pain", rawConfidence: 0.6, wasCorrect: false },
  { complaint: "abdominal pain", rawConfidence: 0.55, wasCorrect: false },
  { complaint: "abdominal pain", rawConfidence: 0.62, wasCorrect: true },
  { complaint: "ear pain", rawConfidence: 0.73, wasCorrect: true },
  { complaint: "ear pain", rawConfidence: 0.7, wasCorrect: true },
  { complaint: "ear pain", rawConfidence: 0.68, wasCorrect: false },
];

export function getSeededCalibration() {
  return buildComplaintCalibration(seededCalibrationRows);
}
