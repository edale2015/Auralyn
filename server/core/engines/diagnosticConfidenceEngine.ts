import type { EngineScore } from './bayesianEngine';

export function diagnosticConfidenceEngine(
  differential: EngineScore[],
  entropyScore: number
): 'high' | 'moderate' | 'low' {
  const top = differential[0]?.score ?? 0;
  if (entropyScore < 0.4 && top > 0.7) return 'high';
  if (entropyScore < 0.9) return 'moderate';
  return 'low';
}
