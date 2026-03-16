export type RiskAlertSeverity = "critical" | "high" | "medium" | "low";

export interface RiskAlert {
  severity: RiskAlertSeverity;
  category: string;
  message: string;
  threshold?: number;
  actual?: number;
}

export interface ClinicalMetrics {
  redFlagAccuracy?: number;
  erDispositionRate?: number;
  overallAccuracy?: number;
  avgResponseTime?: number;
  escalationRate?: number;
  selfCareRate?: number;
  questionCompletionRate?: number;
}

const THRESHOLDS = {
  redFlagAccuracy: { min: 0.95, severity: "critical" as const, message: "Red flag detection accuracy below 95%" },
  erDispositionRate: { min: 0.03, severity: "high" as const, message: "ER triage rate suspiciously low (< 3%)" },
  overallAccuracy: { min: 0.85, severity: "high" as const, message: "Overall triage accuracy below 85%" },
  selfCareRate: { max: 0.70, severity: "medium" as const, message: "Self-care disposition rate suspiciously high (> 70%)" },
  questionCompletionRate: { min: 0.80, severity: "medium" as const, message: "Question completion rate below 80%" },
  escalationRate: { max: 0.40, severity: "medium" as const, message: "Escalation rate above 40%" },
};

export function analyzeClinicalRisk(metrics: ClinicalMetrics): RiskAlert[] {
  const alerts: RiskAlert[] = [];

  if (metrics.redFlagAccuracy != null && metrics.redFlagAccuracy < THRESHOLDS.redFlagAccuracy.min) {
    alerts.push({
      severity: THRESHOLDS.redFlagAccuracy.severity,
      category: "safety",
      message: THRESHOLDS.redFlagAccuracy.message,
      threshold: THRESHOLDS.redFlagAccuracy.min,
      actual: metrics.redFlagAccuracy,
    });
  }

  if (metrics.erDispositionRate != null && metrics.erDispositionRate < THRESHOLDS.erDispositionRate.min) {
    alerts.push({
      severity: THRESHOLDS.erDispositionRate.severity,
      category: "triage",
      message: THRESHOLDS.erDispositionRate.message,
      threshold: THRESHOLDS.erDispositionRate.min,
      actual: metrics.erDispositionRate,
    });
  }

  if (metrics.overallAccuracy != null && metrics.overallAccuracy < THRESHOLDS.overallAccuracy.min) {
    alerts.push({
      severity: THRESHOLDS.overallAccuracy.severity,
      category: "accuracy",
      message: THRESHOLDS.overallAccuracy.message,
      threshold: THRESHOLDS.overallAccuracy.min,
      actual: metrics.overallAccuracy,
    });
  }

  if (metrics.selfCareRate != null && metrics.selfCareRate > (THRESHOLDS.selfCareRate.max ?? 1)) {
    alerts.push({
      severity: THRESHOLDS.selfCareRate.severity,
      category: "distribution",
      message: THRESHOLDS.selfCareRate.message,
      threshold: THRESHOLDS.selfCareRate.max,
      actual: metrics.selfCareRate,
    });
  }

  if (metrics.questionCompletionRate != null && metrics.questionCompletionRate < THRESHOLDS.questionCompletionRate.min) {
    alerts.push({
      severity: THRESHOLDS.questionCompletionRate.severity,
      category: "engagement",
      message: THRESHOLDS.questionCompletionRate.message,
      threshold: THRESHOLDS.questionCompletionRate.min,
      actual: metrics.questionCompletionRate,
    });
  }

  if (metrics.escalationRate != null && metrics.escalationRate > (THRESHOLDS.escalationRate.max ?? 1)) {
    alerts.push({
      severity: THRESHOLDS.escalationRate.severity,
      category: "escalation",
      message: THRESHOLDS.escalationRate.message,
      threshold: THRESHOLDS.escalationRate.max,
      actual: metrics.escalationRate,
    });
  }

  return alerts.sort((a, b) => {
    const order = { critical: 0, high: 1, medium: 2, low: 3 };
    return order[a.severity] - order[b.severity];
  });
}
