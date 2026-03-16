export interface CalibrationRecord {
  predicted: number;
  correct: boolean;
  timestamp: number;
}

export interface CalibrationBucket {
  range: string;
  total: number;
  correct: number;
  actualAccuracy: number;
  calibrationError: number;
}

const MAX_RECORDS = 10000;
const calibrationData: CalibrationRecord[] = [];

export function recordCalibration(predicted: number, correct: boolean) {
  calibrationData.push({
    predicted,
    correct,
    timestamp: Date.now(),
  });

  if (calibrationData.length > MAX_RECORDS) {
    calibrationData.shift();
  }
}

export function computeCalibrationCurve(): CalibrationBucket[] {
  const buckets: Record<string, { total: number; correct: number; midpoint: number }> = {};

  calibrationData.forEach(d => {
    const bucketVal = Math.floor(d.predicted * 10) / 10;
    const key = bucketVal.toFixed(1);

    if (!buckets[key]) {
      buckets[key] = { total: 0, correct: 0, midpoint: bucketVal + 0.05 };
    }
    buckets[key].total++;
    if (d.correct) buckets[key].correct++;
  });

  return Object.entries(buckets)
    .map(([range, data]) => ({
      range,
      total: data.total,
      correct: data.correct,
      actualAccuracy: data.total > 0 ? Math.round((data.correct / data.total) * 1000) / 1000 : 0,
      calibrationError: data.total > 0
        ? Math.round(Math.abs(data.midpoint - data.correct / data.total) * 1000) / 1000
        : 0,
    }))
    .sort((a, b) => parseFloat(a.range) - parseFloat(b.range));
}

export function getCalibrationStats() {
  const curve = computeCalibrationCurve();
  const totalRecords = calibrationData.length;
  const totalCorrect = calibrationData.filter(d => d.correct).length;
  const avgCalibrationError = curve.length > 0
    ? Math.round((curve.reduce((s, b) => s + b.calibrationError, 0) / curve.length) * 1000) / 1000
    : 0;

  return {
    totalRecords,
    overallAccuracy: totalRecords > 0 ? Math.round((totalCorrect / totalRecords) * 1000) / 10 : 0,
    avgCalibrationError,
    bucketCount: curve.length,
    curve,
  };
}
