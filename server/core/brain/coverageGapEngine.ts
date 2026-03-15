export function runCoverageGapEngine(existing: string[], sheetCandidates: string[]): string[] {
  const existingSet = new Set(existing);
  return sheetCandidates.filter((c) => !existingSet.has(c));
}
