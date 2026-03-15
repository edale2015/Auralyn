export function planComplaintExpansion(existingComplaints: string[], candidatesFromSheets: string[]) {
  const existing = new Set(existingComplaints);
  const missing = candidatesFromSheets.filter((c) => !existing.has(c));
  return {
    totalExisting: existingComplaints.length,
    totalCandidates: candidatesFromSheets.length,
    missingComplaints: missing,
    recommendedNextWave: missing.slice(0, 20),
  };
}
