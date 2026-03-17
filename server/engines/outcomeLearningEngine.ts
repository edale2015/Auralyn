export interface OutcomeRecord {
  caseId: string;
  diagnosisPredicted: string;
  diagnosisActual: string;
  dispositionPredicted: string;
  dispositionActual: string;
  confidencePredicted: number;
}

export interface LearningReport {
  totalOutcomes: number;
  diagnosticAccuracy: number;
  dispositionAccuracy: number;
  updatedProbabilities: Record<string, number>;
  confusionMatrix: { predicted: string; actual: string; count: number }[];
  recommendations: string[];
  timestamp: number;
}

const DEMO_OUTCOMES: OutcomeRecord[] = [
  { caseId: "o001", diagnosisPredicted: "URI", diagnosisActual: "URI", dispositionPredicted: "self_care", dispositionActual: "self_care", confidencePredicted: 0.85 },
  { caseId: "o002", diagnosisPredicted: "Sinusitis", diagnosisActual: "Sinusitis", dispositionPredicted: "self_care_followup", dispositionActual: "self_care_followup", confidencePredicted: 0.78 },
  { caseId: "o003", diagnosisPredicted: "Strep Pharyngitis", diagnosisActual: "Strep Pharyngitis", dispositionPredicted: "urgent", dispositionActual: "urgent", confidencePredicted: 0.82 },
  { caseId: "o004", diagnosisPredicted: "URI", diagnosisActual: "Sinusitis", dispositionPredicted: "self_care", dispositionActual: "self_care_followup", confidencePredicted: 0.65 },
  { caseId: "o005", diagnosisPredicted: "Pneumonia", diagnosisActual: "Pneumonia", dispositionPredicted: "er", dispositionActual: "er", confidencePredicted: 0.90 },
  { caseId: "o006", diagnosisPredicted: "Migraine", diagnosisActual: "Tension Headache", dispositionPredicted: "self_care", dispositionActual: "self_care", confidencePredicted: 0.60 },
  { caseId: "o007", diagnosisPredicted: "Influenza", diagnosisActual: "Influenza", dispositionPredicted: "self_care_followup", dispositionActual: "self_care_followup", confidencePredicted: 0.80 },
  { caseId: "o008", diagnosisPredicted: "Otitis Media", diagnosisActual: "Otitis Media", dispositionPredicted: "urgent", dispositionActual: "urgent", confidencePredicted: 0.75 },
  { caseId: "o009", diagnosisPredicted: "Allergic Rhinitis", diagnosisActual: "Allergic Rhinitis", dispositionPredicted: "self_care", dispositionActual: "self_care", confidencePredicted: 0.88 },
  { caseId: "o010", diagnosisPredicted: "COVID-19", diagnosisActual: "Influenza", dispositionPredicted: "urgent", dispositionActual: "self_care_followup", confidencePredicted: 0.55 },
  { caseId: "o011", diagnosisPredicted: "URI", diagnosisActual: "URI", dispositionPredicted: "self_care", dispositionActual: "self_care", confidencePredicted: 0.92 },
  { caseId: "o012", diagnosisPredicted: "Strep Pharyngitis", diagnosisActual: "Peritonsillar Abscess", dispositionPredicted: "urgent", dispositionActual: "er", confidencePredicted: 0.70 },
];

const DEMO_PRIOR: Record<string, number> = {
  URI: 0.20, Sinusitis: 0.10, "Strep Pharyngitis": 0.10, Influenza: 0.08,
  "Allergic Rhinitis": 0.12, Pneumonia: 0.06, "COVID-19": 0.05,
  "Otitis Media": 0.05, Migraine: 0.05, "Tension Headache": 0.08,
  "Peritonsillar Abscess": 0.01, BPPV: 0.03, Epiglottitis: 0.005,
  Meningitis: 0.005, Bronchitis: 0.07,
};

export class OutcomeLearningEngine {
  learn(outcomes?: OutcomeRecord[], prior?: Record<string, number>): LearningReport {
    const data = outcomes?.length ? outcomes : DEMO_OUTCOMES;
    const priorProbs = prior || DEMO_PRIOR;

    let diagCorrect = 0;
    let dispCorrect = 0;
    const actualCounts: Record<string, number> = {};
    const confusionMap: Record<string, number> = {};

    for (const o of data) {
      if (o.diagnosisPredicted === o.diagnosisActual) diagCorrect++;
      if (o.dispositionPredicted === o.dispositionActual) dispCorrect++;

      actualCounts[o.diagnosisActual] = (actualCounts[o.diagnosisActual] || 0) + 1;

      const key = `${o.diagnosisPredicted}|${o.diagnosisActual}`;
      confusionMap[key] = (confusionMap[key] || 0) + 1;
    }

    const updatedProbabilities: Record<string, number> = {};
    const total = data.length;

    for (const d in actualCounts) {
      const observed = actualCounts[d] / total;
      const priorP = priorProbs[d] || 0;
      updatedProbabilities[d] = Number((observed * 0.7 + priorP * 0.3).toFixed(4));
    }

    for (const d in priorProbs) {
      if (!updatedProbabilities[d]) {
        updatedProbabilities[d] = Number((priorProbs[d] * 0.3).toFixed(4));
      }
    }

    const confusionMatrix = Object.entries(confusionMap).map(([key, count]) => {
      const [predicted, actual] = key.split("|");
      return { predicted, actual, count };
    });

    const recommendations: string[] = [];
    const diagAcc = diagCorrect / total;
    const dispAcc = dispCorrect / total;

    if (diagAcc < 0.8) recommendations.push("Diagnostic accuracy below 80% — consider retraining differential engine");
    if (dispAcc < 0.8) recommendations.push("Disposition accuracy below 80% — review protocol rules");

    confusionMatrix
      .filter((c) => c.predicted !== c.actual && c.count > 1)
      .forEach((c) => {
        recommendations.push(`Recurring misclassification: ${c.predicted} → ${c.actual} (${c.count} cases)`);
      });

    return {
      totalOutcomes: total,
      diagnosticAccuracy: Number(diagAcc.toFixed(4)),
      dispositionAccuracy: Number(dispAcc.toFixed(4)),
      updatedProbabilities,
      confusionMatrix,
      recommendations,
      timestamp: Date.now(),
    };
  }
}

export const outcomeLearningEngine = new OutcomeLearningEngine();
