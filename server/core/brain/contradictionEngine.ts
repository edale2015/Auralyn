import { BrainCaseInput, ContradictionResult } from '../../../shared/brainEngineTypes';

const hardPairs: Array<[string, string, string]> = [
  ['male', 'pregnancy', 'Male patient cannot be pregnant.'],
  ['no_fever', 'high_fever', 'No fever and high fever cannot both be true.'],
  ['no_cough', 'productive_cough', 'No cough and productive cough cannot both be true.'],
  ['no_shortness_of_breath', 'shortness_of_breath', 'Breathing contradiction present.']
];

export function runContradictionEngine(input: BrainCaseInput): ContradictionResult {
  const set = new Set([...(input.symptoms || []), ...(input.negatedSymptoms || []), input.sex || '']);
  const errors: string[] = [];
  for (const [a, b, message] of hardPairs) {
    if (set.has(a) && set.has(b)) errors.push(message);
  }
  return { hasErrors: errors.length > 0, hasWarnings: false, errors, warnings: [] };
}
