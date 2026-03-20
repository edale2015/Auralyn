export function calibrateConfidence(rawScore: number): number {
  const clipped = Math.max(0, Math.min(1, rawScore));
  if (clipped > 0.9) return 0.85 + (clipped - 0.9) * 0.5;
  if (clipped < 0.2) return clipped * 0.7;
  return clipped;
}

export function calibrateConfidencePct(rawPct: number): number {
  return Math.round(calibrateConfidence(rawPct / 100) * 100);
}
