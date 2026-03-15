export function supervisorEngine({
  entropy,
  severity,
}: {
  entropy: number;
  severity: number;
}): { decision: 'ESCALATE' | 'REVIEW' | 'PASS'; reason: string } {
  if (severity >= 4) return { decision: 'ESCALATE', reason: 'High severity score' };
  if (entropy > 1.2) return { decision: 'REVIEW', reason: 'High diagnostic uncertainty' };
  return { decision: 'PASS', reason: 'Within normal thresholds' };
}
