export interface AlvaradoInput {
  migratoryRLQPain: boolean;
  anorexia: boolean;
  nausea: boolean;
  rlqTenderness: boolean;
  rebound: boolean;
  fever: boolean;
  leukocytosis: boolean;
  leftShift: boolean;
}

export interface AlvaradoResult {
  score: number;
  maxScore: number;
  risk: string;
  recommendation: string;
  components: { criterion: string; present: boolean; points: number }[];
}

export function calculateAlvarado(input: AlvaradoInput): AlvaradoResult {
  const components = [
    { criterion: "Migratory RLQ pain", present: input.migratoryRLQPain, points: input.migratoryRLQPain ? 1 : 0 },
    { criterion: "Anorexia", present: input.anorexia, points: input.anorexia ? 1 : 0 },
    { criterion: "Nausea/vomiting", present: input.nausea, points: input.nausea ? 1 : 0 },
    { criterion: "RLQ tenderness", present: input.rlqTenderness, points: input.rlqTenderness ? 2 : 0 },
    { criterion: "Rebound tenderness", present: input.rebound, points: input.rebound ? 1 : 0 },
    { criterion: "Elevated temperature", present: input.fever, points: input.fever ? 1 : 0 },
    { criterion: "Leukocytosis (>10K)", present: input.leukocytosis, points: input.leukocytosis ? 2 : 0 },
    { criterion: "Left shift (>75% neutrophils)", present: input.leftShift, points: input.leftShift ? 1 : 0 },
  ];

  const score = components.reduce((s, c) => s + c.points, 0);

  let risk: string;
  let recommendation: string;
  if (score <= 4) {
    risk = "Low";
    recommendation = "Appendicitis unlikely — observe and reassess";
  } else if (score <= 6) {
    risk = "Moderate";
    recommendation = "Possible appendicitis — CT imaging recommended";
  } else {
    risk = "High";
    recommendation = "Probable appendicitis — surgical consultation indicated";
  }

  return { score, maxScore: 10, risk, recommendation, components };
}
