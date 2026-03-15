import { BrainCaseInput, CompletenessResult } from '../../../shared/brainEngineTypes';

const REQUIRED: Record<string, string[]> = {
  chest_pain: ['duration', 'exertional', 'shortness_of_breath'],
  dysuria: ['fever', 'flank_pain', 'pregnancy'],
  sore_throat: ['fever', 'voice_change', 'drooling']
};

export function runComplaintCompletenessEngine(input: BrainCaseInput): CompletenessResult {
  const req = REQUIRED[input.complaint] || [];
  const answered = new Set(input.answeredQuestions || []);
  const missing = req.filter((q) => !answered.has(q));
  return {
    passed: missing.length === 0,
    level: missing.length === 0 ? 'complete' : missing.length <= 1 ? 'partial' : 'insufficient',
    missingQuestions: missing
  };
}
