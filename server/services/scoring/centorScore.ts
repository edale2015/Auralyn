export interface CentorInput {
  fever: boolean;
  tonsillarExudate: boolean;
  tenderAnteriorCervicalNodes: boolean;
  absenceOfCough: boolean;
  age?: number;
}

export interface CentorResult {
  score: number;
  maxScore: number;
  interpretation: string;
  components: { criterion: string; present: boolean; points: number }[];
}

export function computeCentorScore(input: CentorInput): CentorResult {
  const components = [
    { criterion: "Fever (>38°C / 100.4°F)", present: input.fever, points: input.fever ? 1 : 0 },
    { criterion: "Tonsillar exudate", present: input.tonsillarExudate, points: input.tonsillarExudate ? 1 : 0 },
    { criterion: "Tender anterior cervical nodes", present: input.tenderAnteriorCervicalNodes, points: input.tenderAnteriorCervicalNodes ? 1 : 0 },
    { criterion: "Absence of cough", present: input.absenceOfCough, points: input.absenceOfCough ? 1 : 0 },
  ];

  let ageModifier = 0;
  if (input.age !== undefined) {
    if (input.age >= 3 && input.age <= 14) ageModifier = 1;
    else if (input.age >= 45) ageModifier = -1;
  }

  const rawScore = components.reduce((s, c) => s + c.points, 0);
  const score = Math.max(0, rawScore + ageModifier);

  let interpretation: string;
  if (score <= 1) interpretation = "Low risk (~5-10% GAS probability). Symptomatic treatment.";
  else if (score === 2) interpretation = "Moderate risk (~11-17%). Consider rapid strep test.";
  else if (score === 3) interpretation = "Moderate-high risk (~28-35%). Rapid strep test recommended.";
  else interpretation = "High risk (~51-53%). Empiric antibiotics or rapid strep test.";

  return { score, maxScore: 5, interpretation, components };
}
