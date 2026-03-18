export interface TIMIInput {
  age65Plus: boolean;
  threePlusRiskFactors: boolean;
  knownCAD: boolean;
  aspirinUseLast7Days: boolean;
  severeAngina: boolean;
  stDeviation: boolean;
  elevatedTroponin: boolean;
}

export interface TIMIResult {
  score: number;
  maxScore: number;
  risk: string;
  recommendation: string;
  components: { criterion: string; present: boolean; points: number }[];
}

export function calculateTIMI(input: TIMIInput): TIMIResult {
  const components = [
    { criterion: "Age ≥ 65", present: input.age65Plus, points: input.age65Plus ? 1 : 0 },
    { criterion: "≥ 3 CAD risk factors", present: input.threePlusRiskFactors, points: input.threePlusRiskFactors ? 1 : 0 },
    { criterion: "Known CAD (≥50% stenosis)", present: input.knownCAD, points: input.knownCAD ? 1 : 0 },
    { criterion: "ASA use in last 7 days", present: input.aspirinUseLast7Days, points: input.aspirinUseLast7Days ? 1 : 0 },
    { criterion: "Severe angina (≥2 episodes in 24h)", present: input.severeAngina, points: input.severeAngina ? 1 : 0 },
    { criterion: "ST deviation ≥ 0.5mm", present: input.stDeviation, points: input.stDeviation ? 1 : 0 },
    { criterion: "Elevated cardiac markers", present: input.elevatedTroponin, points: input.elevatedTroponin ? 1 : 0 },
  ];

  const score = components.reduce((s, c) => s + c.points, 0);

  let risk: string;
  let recommendation: string;
  if (score <= 2) {
    risk = "Low";
    recommendation = "Low risk NSTEMI/UA — consider early discharge with follow-up";
  } else if (score <= 4) {
    risk = "Moderate";
    recommendation = "Moderate risk — admit for observation, serial troponins, consider stress testing";
  } else {
    risk = "High";
    recommendation = "High risk ACS — early invasive strategy recommended (cath within 24h)";
  }

  return { score, maxScore: 7, risk, recommendation, components };
}
