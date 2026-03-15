export function severityScoringEngine(input: {
  symptoms?: string[];
  vitals?: Record<string, number>;
}): number {
  let score = 0;
  if (input.symptoms?.includes('chest_pain')) score += 3;
  if (input.symptoms?.includes('shortness_of_breath')) score += 2;
  if (input.symptoms?.includes('diaphoresis')) score += 2;
  if (input.symptoms?.includes('altered_consciousness')) score += 4;
  if (input.vitals?.oxygenSaturation !== undefined && input.vitals.oxygenSaturation < 90) score += 4;
  if (input.vitals?.oxygenSaturation !== undefined && input.vitals.oxygenSaturation < 94) score += 2;
  if (input.vitals?.heartRate !== undefined && input.vitals.heartRate > 120) score += 2;
  if (input.vitals?.systolicBP !== undefined && input.vitals.systolicBP < 90) score += 3;
  return score;
}
