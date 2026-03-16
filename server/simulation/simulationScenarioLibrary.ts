import { SimulationCase } from "./simulationCaseFactory";

export const simulationScenarioLibrary: Record<string, Partial<SimulationCase>[]> = {
  cough: [
    {
      features: { fever: true, sob: true, durationDays: 5, chestPain: false },
      expectedDisposition: "urgent_care",
      expectedTopDiagnosis: "pneumonia",
      difficulty: "easy",
    },
    {
      features: { fever: false, sob: false, durationDays: 2, chestPain: false },
      expectedDisposition: "self_care",
      expectedTopDiagnosis: "viral_uri",
      difficulty: "easy",
    },
    {
      features: { fever: true, sob: true, durationDays: 12, chestPain: true, asthmaHistory: true },
      expectedDisposition: "urgent_care",
      expectedTopDiagnosis: "pneumonia_vs_bronchitis",
      difficulty: "hard",
    },
  ],
  chest_pain: [
    {
      features: { exertional: true, sob: true, diaphoresis: true, tearing: false },
      expectedDisposition: "er_now",
      expectedTopDiagnosis: "acute_coronary_syndrome",
      difficulty: "moderate",
    },
    {
      features: { exertional: false, sob: false, diaphoresis: false, tearing: false, pleuritic: true },
      expectedDisposition: "urgent_care",
      expectedTopDiagnosis: "musculoskeletal_or_gerd",
      difficulty: "moderate",
    },
    {
      features: { exertional: false, sob: false, diaphoresis: false, tearing: true },
      expectedDisposition: "er_now",
      expectedTopDiagnosis: "aortic_dissection",
      difficulty: "hard",
    },
  ],
  headache: [
    {
      features: { worst: true, neckStiff: false, neuroDeficit: false, fever: false, vomiting: true },
      expectedDisposition: "er_now",
      expectedTopDiagnosis: "subarachnoid_hemorrhage",
      difficulty: "hard",
    },
    {
      features: { worst: false, neckStiff: false, neuroDeficit: false, fever: false, vomiting: false },
      expectedDisposition: "urgent_care",
      expectedTopDiagnosis: "migraine_or_tension",
      difficulty: "easy",
    },
  ],
  dizziness: [
    {
      features: { unilateralWeakness: true, speechChange: false, positional: false, vomiting: false },
      expectedDisposition: "er_now",
      expectedTopDiagnosis: "stroke",
      difficulty: "hard",
    },
    {
      features: { unilateralWeakness: false, speechChange: false, positional: true, vomiting: true },
      expectedDisposition: "urgent_care",
      expectedTopDiagnosis: "bppv",
      difficulty: "easy",
    },
  ],
};
