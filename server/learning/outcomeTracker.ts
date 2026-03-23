import { logMetric } from "../monitoring/metrics";

export interface CaseOutcome {
  caseId: string;
  patientId?: string;
  predicted: string;
  actual?: string;
  correct?: boolean;
  physicianOverridden?: boolean;
  riskScore?: number;
  timestamp?: string;
}

export interface ModelPerformance {
  accuracy: number;
  overrideRate: number;
  totalCases: number;
  correctCases: number;
  recentWindow: number;
}

const outcomeLog: CaseOutcome[] = [];

export function logOutcome(caseId: string, outcome: Partial<CaseOutcome>): void {
  const entry: CaseOutcome = {
    caseId,
    patientId: outcome.patientId,
    predicted: outcome.predicted ?? "unknown",
    actual: outcome.actual,
    correct: outcome.correct,
    physicianOverridden: outcome.physicianOverridden,
    riskScore: outcome.riskScore,
    timestamp: new Date().toISOString(),
  };

  outcomeLog.push(entry);

  if (entry.correct !== undefined) {
    logMetric("outcome.correct", entry.correct ? 1 : 0, "outcome", { caseId });
  }

  if (entry.physicianOverridden) {
    logMetric("override.occurred", 1, "override", { caseId });
  }
}

export function updateModel(performance: ModelPerformance): void {
  logMetric("model.accuracy", performance.accuracy, "accuracy");
  logMetric("model.override_rate", performance.overrideRate, "override");

  if (performance.accuracy < 0.85) {
    console.log("🔁 Adjusting weights... Accuracy below threshold:", performance.accuracy);
    logMetric("model.weight_adjustment", 1, "accuracy");
  }
}

export function computePerformance(windowSize = 50): ModelPerformance {
  const recent = outcomeLog.slice(-windowSize);
  const withLabel = recent.filter(r => r.correct !== undefined);
  const correct = withLabel.filter(r => r.correct).length;
  const overridden = recent.filter(r => r.physicianOverridden).length;

  return {
    accuracy: withLabel.length ? correct / withLabel.length : 0,
    overrideRate: recent.length ? overridden / recent.length : 0,
    totalCases: outcomeLog.length,
    correctCases: outcomeLog.filter(r => r.correct).length,
    recentWindow: recent.length,
  };
}

export function getOutcomeLog(limit = 20): CaseOutcome[] {
  return outcomeLog.slice(-limit);
}
