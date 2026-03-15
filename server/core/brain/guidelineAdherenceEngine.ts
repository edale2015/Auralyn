import { GuidelineAdherenceResult, RankedItem } from '../../../shared/brainEngineTypes';

export function runGuidelineAdherenceEngine(
  differentials: RankedItem[],
  tests: RankedItem[]
): GuidelineAdherenceResult {
  const top = differentials[0]?.id;
  const testIds = new Set(tests.map((t) => t.id));
  const minorVariance: string[] = [];
  const majorVariance: string[] = [];
  if (top === 'acute_coronary_syndrome' && !testIds.has('ecg')) {
    majorVariance.push('ACS without ECG in workup.');
  }
  if (top === 'uti' && !testIds.has('urinalysis')) {
    minorVariance.push('UTI without urinalysis noted.');
  }
  return { passed: majorVariance.length === 0, minorVariance, majorVariance };
}
