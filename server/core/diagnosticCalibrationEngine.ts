export interface CalibratedDifferential {
  diagnosis: string;
  rawScore: number;
  calibratedScore: number;
  percentile: number;
}

export function diagnosticCalibrationEngine(
  differential: { diagnosis: string; score: number }[]
): CalibratedDifferential[] {
  if (!differential.length) return [];

  const max = differential[0].score;
  if (max <= 0) return differential.map((d) => ({ ...d, rawScore: d.score, calibratedScore: 0, percentile: 0 }));

  const total = differential.reduce((sum, d) => sum + d.score, 0);

  return differential.map((d, i) => {
    const normalized = d.score / max;
    const calibrated = normalized > 0.85 ? 0.85 + (normalized - 0.85) * 0.3 : normalized;
    const percentile = 100 - Math.round((i / Math.max(differential.length - 1, 1)) * 100);
    return {
      diagnosis: d.diagnosis,
      rawScore: d.score,
      calibratedScore: Math.round(calibrated * 1000) / 1000,
      percentile,
    };
  });
}

export function softmaxCalibration(
  differential: { diagnosis: string; score: number }[],
  temperature = 1.0
): { diagnosis: string; probability: number }[] {
  if (!differential.length) return [];
  const exps = differential.map((d) => Math.exp(d.score / temperature));
  const sumExps = exps.reduce((a, b) => a + b, 0);
  return differential.map((d, i) => ({
    diagnosis: d.diagnosis,
    probability: Math.round((exps[i] / sumExps) * 1000) / 1000,
  }));
}
