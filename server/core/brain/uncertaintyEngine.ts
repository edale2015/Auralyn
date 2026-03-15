import { RankedItem, UncertaintyResult } from '../../../shared/brainEngineTypes';

export function runUncertaintyEngine(items: RankedItem[]): UncertaintyResult {
  const probs = items.slice(0, 5).map((x) => Math.max(1e-6, x.score));
  const sum = probs.reduce((a, b) => a + b, 0) || 1;
  const entropy = probs.map((p) => p / sum).reduce((acc, p) => acc - p * Math.log2(p), 0);
  return {
    entropy,
    isHigh: entropy > 1.0,
    recommendation: entropy > 1.4 ? 'escalate_review' : entropy > 1.0 ? 'ask_next_question' : 'continue'
  };
}
