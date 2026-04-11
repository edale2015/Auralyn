export interface OutcomeData {
  scriptVariant: string;
  antibioticsGiven: boolean;
  returnVisit: boolean;
  patientSatisfaction?: number;
}

const VARIANT_NAMES = [
  "neutral_variant",
  "frustrated_variant",
  "demanding_variant",
  "anxious_variant",
];

const weights: Record<string, number> = {
  neutral_variant:    1,
  frustrated_variant: 1,
  demanding_variant:  1,
  anxious_variant:    1,
};

export function updateWeights(outcome: OutcomeData): void {
  let delta = 0;

  if (!outcome.antibioticsGiven) delta += 0.1;
  if (!outcome.returnVisit)      delta += 0.1;
  if ((outcome.patientSatisfaction || 0) > 4) delta += 0.2;
  if (outcome.returnVisit)       delta -= 0.2;
  if (outcome.antibioticsGiven)  delta -= 0.1;

  const current = weights[outcome.scriptVariant] ?? 1;
  weights[outcome.scriptVariant] = Math.max(0.5, Math.min(2, current + delta));
}

export function getBestVariant(): string {
  return Object.entries(weights).sort((a, b) => b[1] - a[1])[0][0];
}

export function getWeights(): Record<string, number> {
  return { ...weights };
}

export function resetWeights(): void {
  for (const v of VARIANT_NAMES) {
    weights[v] = 1;
  }
}

export function getVariantRanking(): Array<{ variant: string; weight: number }> {
  return Object.entries(weights)
    .map(([variant, weight]) => ({ variant, weight }))
    .sort((a, b) => b.weight - a.weight);
}
