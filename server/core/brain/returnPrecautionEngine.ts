export function runReturnPrecautionEngine(topDiagnosis?: string): string[] {
  const common = [
    'Go to the ER for trouble breathing, chest pain, fainting, or confusion.',
    'Seek urgent care if symptoms rapidly worsen or new severe symptoms appear.'
  ];
  if (topDiagnosis === 'uti') {
    common.unshift('Seek care quickly for fever, flank pain, vomiting, or inability to keep fluids down.');
  }
  if (topDiagnosis === 'pharyngitis') {
    common.unshift('Seek urgent care for drooling, muffled voice, neck swelling, or trouble swallowing.');
  }
  return common;
}
