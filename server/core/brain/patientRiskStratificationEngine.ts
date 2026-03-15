import { BrainCaseInput, RankedItem } from '../../../shared/brainEngineTypes';

export function runPatientRiskStratificationEngine(
  input: BrainCaseInput,
  differentials: RankedItem[]
): string[] {
  const risks: string[] = [];
  if ((input.ageYears || 0) >= 65) risks.push('Older adult risk.');
  if (input.vitals?.spo2 !== undefined && input.vitals.spo2 < 92) risks.push('Hypoxemia risk.');
  if ((input.riskFactors || []).includes('immunocompromised')) risks.push('Immunocompromised.');
  if (differentials[0]?.id === 'pulmonary_embolism') risks.push('Potential thromboembolic disease.');
  return risks;
}
