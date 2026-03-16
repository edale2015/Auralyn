export interface ClinicalOutcome {
  caseId: string;
  predictedDiagnosis: string;
  actualDiagnosis: string;
  predictedDisposition: string;
  actualDisposition?: string;
  correct: boolean;
  timestamp: string;
}

const outcomes: ClinicalOutcome[] = [];

export function recordOutcome(
  caseId: string,
  predictedDiagnosis: string,
  actualDiagnosis: string,
  predictedDisposition: string,
  actualDisposition?: string
): ClinicalOutcome {
  const outcome: ClinicalOutcome = {
    caseId,
    predictedDiagnosis,
    actualDiagnosis,
    predictedDisposition,
    actualDisposition,
    correct: predictedDiagnosis.toLowerCase() === actualDiagnosis.toLowerCase(),
    timestamp: new Date().toISOString(),
  };
  outcomes.push(outcome);
  return outcome;
}

export function getOutcomeStats() {
  const total = outcomes.length;
  if (total === 0) return { total: 0, accuracy: 0, diagnoses: {} };

  const correct = outcomes.filter(o => o.correct).length;
  const diagnoses: Record<string, { total: number; correct: number }> = {};

  outcomes.forEach(o => {
    if (!diagnoses[o.actualDiagnosis]) {
      diagnoses[o.actualDiagnosis] = { total: 0, correct: 0 };
    }
    diagnoses[o.actualDiagnosis].total++;
    if (o.correct) diagnoses[o.actualDiagnosis].correct++;
  });

  return {
    total,
    accuracy: Math.round((correct / total) * 1000) / 10,
    diagnoses,
    recentOutcomes: outcomes.slice(-20),
  };
}

export function getOutcomes(): ClinicalOutcome[] {
  return outcomes;
}
