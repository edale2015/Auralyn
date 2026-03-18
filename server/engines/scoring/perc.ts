export interface PERCInput {
  age: number;
  hr: number;
  o2: number;
  hemoptysis: boolean;
  estrogen: boolean;
  priorDvt: boolean;
  unilateralLegSwelling: boolean;
  recentSurgery: boolean;
}

export interface PERCResult {
  score: number;
  negative: boolean;
  recommendation: string;
  components: { criterion: string; present: boolean }[];
}

export function calculatePERC(input: PERCInput): PERCResult {
  const components = [
    { criterion: "Age > 50", present: input.age > 50 },
    { criterion: "Heart rate > 100", present: input.hr > 100 },
    { criterion: "O2 sat < 95%", present: input.o2 < 95 },
    { criterion: "Hemoptysis", present: input.hemoptysis },
    { criterion: "Estrogen use", present: input.estrogen },
    { criterion: "Prior DVT/PE", present: input.priorDvt },
    { criterion: "Unilateral leg swelling", present: input.unilateralLegSwelling },
    { criterion: "Recent surgery/trauma", present: input.recentSurgery },
  ];

  const anyPositive = components.some((c) => c.present);
  const score = components.filter((c) => c.present).length;

  return {
    score,
    negative: !anyPositive,
    recommendation: anyPositive
      ? "PERC criteria NOT met — cannot rule out PE by PERC alone"
      : "PERC negative — PE can be ruled out without further testing",
    components,
  };
}
