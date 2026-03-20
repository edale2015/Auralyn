import type { ValidationResult } from "./validationRunner";

export interface FDAMetrics {
  total: number;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  sensitivity: number;
  precision: number;
  accuracy: number;
  f1Score: number;
  passesThreshold: boolean;
  threshold: number;
}

export function computeMetrics(results: ValidationResult[], threshold = 0.8): FDAMetrics {
  let tp = 0, fp = 0, fn = 0;

  for (const r of results) {
    if (r.correct) {
      tp++;
    } else {
      fp++;
      fn++;
    }
  }

  const total = results.length || 1;
  const sensitivity = tp / (tp + fn || 1);
  const precision = tp / (tp + fp || 1);
  const accuracy = tp / total;
  const f1Score = (2 * precision * sensitivity) / (precision + sensitivity || 1);

  return {
    total: results.length,
    truePositives: tp,
    falsePositives: fp,
    falseNegatives: fn,
    sensitivity: Number(sensitivity.toFixed(4)),
    precision: Number(precision.toFixed(4)),
    accuracy: Number(accuracy.toFixed(4)),
    f1Score: Number(f1Score.toFixed(4)),
    passesThreshold: accuracy >= threshold,
    threshold,
  };
}
