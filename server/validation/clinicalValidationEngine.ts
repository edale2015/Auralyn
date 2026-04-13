/**
 * Clinical Validation Engine
 * Computes sensitivity, specificity, accuracy, and false negative/positive rates
 * against a labeled ground-truth dataset.
 * Used for FDA SaMD Class II performance documentation.
 */

export type ClinicalDisposition = "ER_NOW" | "URGENT" | "ROUTINE";

export interface CaseResult {
  caseId?: string;
  actual: ClinicalDisposition;
  predicted: ClinicalDisposition;
}

export interface ValidationMetrics {
  totalCases: number;
  sensitivity: number;           // TP / (TP + FN) — recall for ER_NOW
  specificity: number;           // TN / (TN + FP)
  accuracy: number;              // (TP + TN) / total
  falseNegativeRate: number;     // FN / (TP + FN) — critical: missed ER cases
  falsePositiveRate: number;     // FP / (TN + FP)
  ppv: number;                   // Positive predictive value
  npv: number;                   // Negative predictive value
  confusionMatrix: {
    TP: number; TN: number; FP: number; FN: number;
  };
}

/**
 * Binary classification treating ER_NOW as "positive".
 * False negatives (missed ER cases) are the primary safety concern.
 */
export function computeMetrics(cases: CaseResult[]): ValidationMetrics {
  let TP = 0, TN = 0, FP = 0, FN = 0;

  for (const c of cases) {
    const actualER  = c.actual    === "ER_NOW";
    const predER    = c.predicted === "ER_NOW";

    if (actualER  && predER)  TP++;
    if (!actualER && !predER) TN++;
    if (!actualER && predER)  FP++;
    if (actualER  && !predER) FN++;
  }

  const sensitivity        = TP / Math.max(TP + FN, 1);
  const specificity        = TN / Math.max(TN + FP, 1);
  const accuracy           = (TP + TN) / Math.max(cases.length, 1);
  const falseNegativeRate  = FN / Math.max(TP + FN, 1);
  const falsePositiveRate  = FP / Math.max(TN + FP, 1);
  const ppv                = TP / Math.max(TP + FP, 1);
  const npv                = TN / Math.max(TN + FN, 1);

  return {
    totalCases: cases.length,
    sensitivity,
    specificity,
    accuracy,
    falseNegativeRate,
    falsePositiveRate,
    ppv,
    npv,
    confusionMatrix: { TP, TN, FP, FN },
  };
}

export function meetsERNowSensitivityThreshold(metrics: ValidationMetrics, threshold = 0.90): boolean {
  return metrics.sensitivity >= threshold;
}

export function generatePerformanceSummary(metrics: ValidationMetrics): string {
  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
  const passes = meetsERNowSensitivityThreshold(metrics);
  return [
    `Sensitivity (ER_NOW recall): ${pct(metrics.sensitivity)} — ${passes ? "✅ MEETS" : "❌ FAILS"} 90% threshold`,
    `Specificity: ${pct(metrics.specificity)}`,
    `Accuracy: ${pct(metrics.accuracy)}`,
    `False Negative Rate: ${pct(metrics.falseNegativeRate)} (missed ER_NOW cases — lower is safer)`,
    `False Positive Rate: ${pct(metrics.falsePositiveRate)}`,
    `PPV: ${pct(metrics.ppv)}, NPV: ${pct(metrics.npv)}`,
    `Confusion: TP=${metrics.confusionMatrix.TP} TN=${metrics.confusionMatrix.TN} FP=${metrics.confusionMatrix.FP} FN=${metrics.confusionMatrix.FN}`,
  ].join("\n");
}
