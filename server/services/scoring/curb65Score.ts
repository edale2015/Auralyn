/**
 * CURB-65 Score — Community-Acquired Pneumonia Severity
 * Predicts 30-day mortality risk and guides admission decisions.
 * Reference: Lim et al., Thorax 2003.
 */

export interface CURB65Input {
  confusion: boolean;
  ureaNitrogenMgdLGreaterThan19: boolean;
  respiratoryRateGreaterThan30: boolean;
  bloodPressureLow: boolean;
  age65OrOlder: boolean;
}

export interface CURB65Result {
  score: number;
  maxScore: number;
  riskCategory: '30-day mortality <1%' | '30-day mortality ~1%' | '30-day mortality ~9%' | '30-day mortality ~17-22%';
  recommendation: string;
  components: { criterion: string; present: boolean; points: number }[];
}

export function computeCURB65Score(input: CURB65Input): CURB65Result {
  const components = [
    { criterion: "Confusion (new disorientation)", present: input.confusion, points: input.confusion ? 1 : 0 },
    { criterion: "Blood urea nitrogen >19 mg/dL (>7 mmol/L)", present: input.ureaNitrogenMgdLGreaterThan19, points: input.ureaNitrogenMgdLGreaterThan19 ? 1 : 0 },
    { criterion: "Respiratory rate ≥30/min", present: input.respiratoryRateGreaterThan30, points: input.respiratoryRateGreaterThan30 ? 1 : 0 },
    { criterion: "Low blood pressure (SBP <90 or DBP ≤60 mmHg)", present: input.bloodPressureLow, points: input.bloodPressureLow ? 1 : 0 },
    { criterion: "Age ≥65 years", present: input.age65OrOlder, points: input.age65OrOlder ? 1 : 0 },
  ];

  const score = components.reduce((s, c) => s + c.points, 0);

  let riskCategory: CURB65Result['riskCategory'];
  let recommendation: string;

  if (score <= 1) {
    riskCategory = '30-day mortality <1%';
    recommendation = score === 0
      ? 'Low risk. Outpatient treatment appropriate.'
      : 'Low risk. Consider outpatient treatment; reassess if clinical concern.';
  } else if (score === 2) {
    riskCategory = '30-day mortality ~9%';
    recommendation = 'Moderate risk. Consider short stay or hospital admission for monitoring.';
  } else {
    riskCategory = score === 3 ? '30-day mortality ~17-22%' : '30-day mortality ~17-22%';
    recommendation = 'High risk. Hospital admission required. Score ≥4 consider ICU.';
  }

  return { score, maxScore: 5, riskCategory, recommendation, components };
}
