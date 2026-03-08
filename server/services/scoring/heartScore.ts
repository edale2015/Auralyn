export interface HeartInput {
  history: "slightly_suspicious" | "moderately_suspicious" | "highly_suspicious";
  ecg: "normal" | "nonspecific_repolarization" | "significant_deviation";
  age: number;
  riskFactors: number;
  troponin: "normal" | "1_3x_normal" | "gt_3x_normal";
}

export interface HeartResult {
  score: number;
  riskCategory: string;
  interpretation: string;
  components: { criterion: string; value: string; points: number }[];
}

export function computeHeartScore(input: HeartInput): HeartResult {
  const historyPoints = input.history === "slightly_suspicious" ? 0 : input.history === "moderately_suspicious" ? 1 : 2;
  const ecgPoints = input.ecg === "normal" ? 0 : input.ecg === "nonspecific_repolarization" ? 1 : 2;
  const agePoints = input.age < 45 ? 0 : input.age <= 64 ? 1 : 2;
  const rfPoints = Math.min(2, input.riskFactors);
  const troponinPoints = input.troponin === "normal" ? 0 : input.troponin === "1_3x_normal" ? 1 : 2;

  const components = [
    { criterion: "History", value: input.history, points: historyPoints },
    { criterion: "ECG", value: input.ecg, points: ecgPoints },
    { criterion: "Age", value: String(input.age), points: agePoints },
    { criterion: "Risk factors", value: String(input.riskFactors), points: rfPoints },
    { criterion: "Troponin", value: input.troponin, points: troponinPoints },
  ];

  const score = historyPoints + ecgPoints + agePoints + rfPoints + troponinPoints;

  let riskCategory: string;
  let interpretation: string;
  if (score <= 3) {
    riskCategory = "Low";
    interpretation = "Low risk (1.7% MACE). Consider discharge with outpatient follow-up.";
  } else if (score <= 6) {
    riskCategory = "Moderate";
    interpretation = "Moderate risk (12-16.6% MACE). Observation and further workup recommended.";
  } else {
    riskCategory = "High";
    interpretation = "High risk (50-65% MACE). Early invasive measures recommended.";
  }

  return { score, riskCategory, interpretation, components };
}
