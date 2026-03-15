export function runClinicalKnowledgeGraphExpansionEngine(
  existingDiagnoses: string[],
  candidateSheetRows: { diagnosis: string; symptom: string }[]
): { toAdd: { diagnosis: string; symptom: string }[] } {
  const dxSet = new Set(existingDiagnoses);
  return { toAdd: candidateSheetRows.filter((r) => !dxSet.has(r.diagnosis)) };
}
