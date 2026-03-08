export interface WellsInput {
  clinicalSignsDVT: boolean;
  peDiagnosisMostLikely: boolean;
  heartRate100: boolean;
  immobilizationOrSurgery: boolean;
  previousDVTPE: boolean;
  hemoptysis: boolean;
  malignancy: boolean;
}

export interface WellsResult {
  score: number;
  riskCategory: string;
  interpretation: string;
  components: { criterion: string; present: boolean; points: number }[];
}

export function computeWellsScore(input: WellsInput): WellsResult {
  const components = [
    { criterion: "Clinical signs/symptoms of DVT", present: input.clinicalSignsDVT, points: input.clinicalSignsDVT ? 3 : 0 },
    { criterion: "PE is #1 diagnosis or equally likely", present: input.peDiagnosisMostLikely, points: input.peDiagnosisMostLikely ? 3 : 0 },
    { criterion: "Heart rate >100", present: input.heartRate100, points: input.heartRate100 ? 1.5 : 0 },
    { criterion: "Immobilization/surgery in prior 4 weeks", present: input.immobilizationOrSurgery, points: input.immobilizationOrSurgery ? 1.5 : 0 },
    { criterion: "Previous DVT/PE", present: input.previousDVTPE, points: input.previousDVTPE ? 1.5 : 0 },
    { criterion: "Hemoptysis", present: input.hemoptysis, points: input.hemoptysis ? 1 : 0 },
    { criterion: "Malignancy (treatment within 6 months)", present: input.malignancy, points: input.malignancy ? 1 : 0 },
  ];

  const score = components.reduce((s, c) => s + c.points, 0);

  let riskCategory: string;
  let interpretation: string;
  if (score <= 1) {
    riskCategory = "Low";
    interpretation = "Low probability of PE. Consider D-dimer; if negative, PE excluded.";
  } else if (score <= 4) {
    riskCategory = "Moderate";
    interpretation = "Moderate probability. D-dimer testing recommended; if positive, CTPA indicated.";
  } else {
    riskCategory = "High";
    interpretation = "High probability of PE. CTPA recommended regardless of D-dimer.";
  }

  return { score, riskCategory, interpretation, components };
}
