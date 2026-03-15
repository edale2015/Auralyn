import { BrainCaseInput, SeverityResult } from '../../../shared/brainEngineTypes';

export function runSeverityScoringEngine(input: BrainCaseInput): SeverityResult {
  let score = 0;
  const reasons: string[] = [];
  const s = new Set(input.symptoms);
  if (s.has('chest_pain') || s.has('thunderclap_headache')) {
    score += 3;
    reasons.push('High-risk presenting symptom.');
  }
  if ((input.vitals?.spo2 || 100) < 90) {
    score += 4;
    reasons.push('Severe hypoxemia.');
  }
  if ((input.vitals?.systolicBP || 120) < 90) {
    score += 4;
    reasons.push('Hypotension.');
  }
  if ((input.vitals?.heartRate || 80) > 130) {
    score += 2;
    reasons.push('Marked tachycardia.');
  }
  const level = score >= 7 ? 'critical' : score >= 4 ? 'high' : score >= 2 ? 'moderate' : 'low';
  return { level, score, reasons };
}
