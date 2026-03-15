export function runTemporalProgressionEngine(timeline: string[] = []): string[] {
  const flags: string[] = [];
  const joined = timeline.join(' | ').toLowerCase();
  if (joined.includes('worsening rapidly')) flags.push('Rapid worsening over time.');
  if (joined.includes('sudden onset')) flags.push('Sudden onset pattern.');
  if (joined.includes('persistent > 3 weeks')) flags.push('Persistent symptom duration.');
  return flags;
}
