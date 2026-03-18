export interface CHA2DS2VASCInput {
  chf: boolean;
  hypertension: boolean;
  age: number;
  diabetes: boolean;
  strokeTiaHistory: boolean;
  vascularDisease: boolean;
  female: boolean;
}

export interface CHA2DS2VASCResult {
  score: number;
  maxScore: number;
  riskCategory: string;
  recommendation: string;
  components: { criterion: string; present: boolean; points: number }[];
}

export function calculateCHA2DS2VASC(input: CHA2DS2VASCInput): CHA2DS2VASCResult {
  const components = [
    { criterion: "CHF / LV dysfunction", present: input.chf, points: input.chf ? 1 : 0 },
    { criterion: "Hypertension", present: input.hypertension, points: input.hypertension ? 1 : 0 },
    { criterion: "Age ≥ 75", present: input.age >= 75, points: input.age >= 75 ? 2 : 0 },
    { criterion: "Age 65-74", present: input.age >= 65 && input.age < 75, points: input.age >= 65 && input.age < 75 ? 1 : 0 },
    { criterion: "Diabetes", present: input.diabetes, points: input.diabetes ? 1 : 0 },
    { criterion: "Stroke/TIA history", present: input.strokeTiaHistory, points: input.strokeTiaHistory ? 2 : 0 },
    { criterion: "Vascular disease", present: input.vascularDisease, points: input.vascularDisease ? 1 : 0 },
    { criterion: "Female sex", present: input.female, points: input.female ? 1 : 0 },
  ];

  const score = components.reduce((s, c) => s + c.points, 0);

  let riskCategory: string;
  let recommendation: string;
  if (score === 0) {
    riskCategory = "Low";
    recommendation = "No anticoagulation recommended";
  } else if (score === 1) {
    riskCategory = "Low-Moderate";
    recommendation = "Consider anticoagulation — discuss with patient";
  } else {
    riskCategory = "Moderate-High";
    recommendation = "Oral anticoagulation recommended (DOAC preferred)";
  }

  return { score, maxScore: 9, riskCategory, recommendation, components };
}
