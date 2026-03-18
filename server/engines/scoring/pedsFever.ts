export interface PedsFeverInput {
  ageMonths: number;
  temperature: number;
  appearsIll: boolean;
  immunocompromised: boolean;
  noSourceIdentified: boolean;
}

export interface PedsFeverResult {
  risk: string;
  score: number;
  recommendation: string;
  components: { criterion: string; present: boolean; points: number }[];
}

export function calculatePedsFever(input: PedsFeverInput): PedsFeverResult {
  const components = [
    { criterion: "Age < 3 months", present: input.ageMonths < 3, points: input.ageMonths < 3 ? 3 : 0 },
    { criterion: "Age 3-24 months", present: input.ageMonths >= 3 && input.ageMonths <= 24, points: input.ageMonths >= 3 && input.ageMonths <= 24 ? 1 : 0 },
    { criterion: "Temperature ≥ 39°C (102.2°F)", present: input.temperature >= 39, points: input.temperature >= 39 ? 2 : 0 },
    { criterion: "Ill-appearing", present: input.appearsIll, points: input.appearsIll ? 2 : 0 },
    { criterion: "Immunocompromised", present: input.immunocompromised, points: input.immunocompromised ? 2 : 0 },
    { criterion: "No source identified", present: input.noSourceIdentified, points: input.noSourceIdentified ? 1 : 0 },
  ];

  const score = components.reduce((s, c) => s + c.points, 0);

  let risk: string;
  let recommendation: string;
  if (input.ageMonths < 3 && input.temperature >= 38) {
    risk = "High";
    recommendation = "Urgent evaluation required — full sepsis workup recommended for febrile neonate";
  } else if (score >= 5) {
    risk = "High";
    recommendation = "Urgent evaluation — consider blood cultures, UA, CXR";
  } else if (score >= 3) {
    risk = "Moderate";
    recommendation = "Further workup recommended — urinalysis, close follow-up";
  } else {
    risk = "Low";
    recommendation = "Supportive care with close follow-up in 24-48 hours";
  }

  return { risk, score, recommendation, components };
}
