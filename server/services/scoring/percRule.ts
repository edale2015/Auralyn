/**
 * PERC Rule (Pulmonary Embolism Rule-out Criteria)
 * If ALL 8 criteria are ABSENT in a low-pretest-probability patient,
 * PE can be ruled out without further workup (sensitivity ~97%, specificity ~22%).
 * Reference: Kline et al., J Thromb Haemost 2004.
 */

export interface PERCInput {
  age50OrOlder: boolean;
  heartRate100OrHigher: boolean;
  spo2LessThan95: boolean;
  unilateralLegSwelling: boolean;
  hemoptysis: boolean;
  recentSurgeryOrTrauma: boolean;
  priorDVTorPE: boolean;
  estrogenUse: boolean;
}

export interface PERCResult {
  score: number;
  percNegative: boolean;
  interpretation: string;
  components: { criterion: string; present: boolean }[];
}

export function computePERCRule(input: PERCInput): PERCResult {
  const components = [
    { criterion: "Age ≥50", present: input.age50OrOlder },
    { criterion: "Heart rate ≥100 bpm", present: input.heartRate100OrHigher },
    { criterion: "SpO₂ <95% on room air", present: input.spo2LessThan95 },
    { criterion: "Unilateral leg swelling", present: input.unilateralLegSwelling },
    { criterion: "Hemoptysis", present: input.hemoptysis },
    { criterion: "Recent surgery or trauma (within 4 weeks)", present: input.recentSurgeryOrTrauma },
    { criterion: "Prior DVT or PE", present: input.priorDVTorPE },
    { criterion: "Estrogen use (OCP, HRT, pregnancy within 1 year postpartum)", present: input.estrogenUse },
  ];

  const score = components.filter(c => c.present).length;
  const percNegative = score === 0;

  const interpretation = percNegative
    ? "PERC negative — all 8 criteria absent. In low pretest probability patients, PE can be excluded without D-dimer."
    : `PERC positive (${score} criterion/criteria present). Further workup required — obtain D-dimer or proceed to imaging per Wells score.`;

  return { score, percNegative, interpretation, components };
}
