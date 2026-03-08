export interface ValidationStats {
  sampleSize: number;
  mean: number;
  stdDev: number;
  ci95Lower: number;
  ci95Upper: number;
  significanceLevel: number;
}

export function computeValidationStats(values: number[]): ValidationStats {
  const n = values.length;
  if (n === 0) return { sampleSize: 0, mean: 0, stdDev: 0, ci95Lower: 0, ci95Upper: 0, significanceLevel: 1 };

  const mean = values.reduce((s, v) => s + v, 0) / n;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1 || 1);
  const stdDev = Math.sqrt(variance);
  const se = stdDev / Math.sqrt(n);
  const z = 1.96;

  return {
    sampleSize: n,
    mean: Math.round(mean * 1000) / 1000,
    stdDev: Math.round(stdDev * 1000) / 1000,
    ci95Lower: Math.round((mean - z * se) * 1000) / 1000,
    ci95Upper: Math.round((mean + z * se) * 1000) / 1000,
    significanceLevel: 0.05,
  };
}
