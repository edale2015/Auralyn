export interface CURB65Input {
  confusion: boolean;
  bun: number;
  respirationRate: number;
  systolicBP: number;
  diastolicBP: number;
  age: number;
}

export interface CURB65Result {
  score: number;
  maxScore: number;
  risk: string;
  recommendation: string;
  components: { criterion: string; present: boolean; points: number }[];
}

export function calculateCURB65(input: CURB65Input): CURB65Result {
  const components = [
    { criterion: "Confusion (new onset)", present: input.confusion, points: input.confusion ? 1 : 0 },
    { criterion: "BUN > 19 mg/dL (7 mmol/L)", present: input.bun > 19, points: input.bun > 19 ? 1 : 0 },
    { criterion: "Respiratory rate ≥ 30", present: input.respirationRate >= 30, points: input.respirationRate >= 30 ? 1 : 0 },
    { criterion: "Low BP (SBP < 90 or DBP ≤ 60)", present: input.systolicBP < 90 || input.diastolicBP <= 60, points: (input.systolicBP < 90 || input.diastolicBP <= 60) ? 1 : 0 },
    { criterion: "Age ≥ 65", present: input.age >= 65, points: input.age >= 65 ? 1 : 0 },
  ];

  const score = components.reduce((s, c) => s + c.points, 0);

  let risk: string;
  let recommendation: string;
  if (score <= 1) {
    risk = "Low";
    recommendation = "Low mortality risk — consider outpatient treatment";
  } else if (score === 2) {
    risk = "Moderate";
    recommendation = "Moderate risk — consider short inpatient stay or supervised outpatient";
  } else {
    risk = "High";
    recommendation = "Severe pneumonia — ICU admission may be required";
  }

  return { score, maxScore: 5, risk, recommendation, components };
}
