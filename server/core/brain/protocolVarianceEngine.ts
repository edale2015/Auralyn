import { ProtocolVarianceResult, RankedItem } from '../../../shared/brainEngineTypes';

export function runProtocolVarianceEngine(
  differentials: RankedItem[],
  tests: RankedItem[]
): ProtocolVarianceResult {
  const notes: string[] = [];
  const hasACS = differentials[0]?.id === 'acute_coronary_syndrome';
  const testIds = new Set(tests.map((t) => t.id));
  if (hasACS && !testIds.has('ecg')) notes.push('Major variance: suspected ACS without ECG.');
  return {
    hasMinor: false,
    hasMajor: notes.some((n) => n.startsWith('Major')),
    notes
  };
}
