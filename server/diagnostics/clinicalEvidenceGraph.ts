export const EVIDENCE_GRAPH: Record<string, string[]> = {
  fever: ["pneumonia", "viral_uri", "meningitis", "strep_pharyngitis", "uti", "appendicitis"],
  cough: ["viral_uri", "bronchitis", "pneumonia", "asthma"],
  "chest pain": ["acs", "pneumonia", "pulmonary_embolism", "pericarditis", "gerd", "musculoskeletal"],
  "shortness of breath": ["acs", "pulmonary_embolism", "pneumonia", "asthma", "bronchitis"],
  "sore throat": ["strep_pharyngitis", "viral_uri", "peritonsillar_abscess", "infectious_mononucleosis"],
  headache: ["tension_headache", "migraine", "meningitis", "subarachnoid_hemorrhage", "viral_uri"],
  "neck stiffness": ["meningitis", "subarachnoid_hemorrhage"],
  "abdominal pain": ["appendicitis", "uti", "viral_gastroenteritis", "kidney_stone"],
  nausea: ["viral_gastroenteritis", "appendicitis", "acs", "migraine"],
  "burning urination": ["uti"],
  "sweating": ["acs", "hypoglycemia", "anxiety"],
  "radiating": ["acs", "kidney_stone"],
  "difficulty opening": ["peritonsillar_abscess"],
  trismus: ["peritonsillar_abscess"],
  "thunderclap": ["subarachnoid_hemorrhage"],
  "worst headache": ["subarachnoid_hemorrhage"],
  "productive cough": ["pneumonia", "bronchitis"],
  wheezing: ["asthma", "bronchitis"],
  "dysuria": ["uti"],
  "frequency": ["uti", "diabetes"],
}

export function graphReasoning(
  symptomsText: string
): Array<{ diagnosis: string; score: number; matchedSignals: string[] }> {
  const s = symptomsText.toLowerCase()
  const votes: Record<string, { score: number; signals: string[] }> = {}

  for (const [signal, diagnoses] of Object.entries(EVIDENCE_GRAPH)) {
    if (s.includes(signal)) {
      for (const dx of diagnoses) {
        votes[dx] ??= { score: 0, signals: [] }
        votes[dx].score += 1
        votes[dx].signals.push(signal)
      }
    }
  }

  return Object.entries(votes)
    .map(([diagnosis, { score, signals }]) => ({ diagnosis, score, matchedSignals: signals }))
    .sort((a, b) => b.score - a.score)
}

export function getEvidenceForDiagnosis(
  diagnosis: string,
  symptomsText: string
): { matched: string[]; expected: string[] } {
  const s = symptomsText.toLowerCase()
  const expected: string[] = []
  const matched: string[] = []

  for (const [signal, diagnoses] of Object.entries(EVIDENCE_GRAPH)) {
    if (diagnoses.includes(diagnosis)) {
      expected.push(signal)
      if (s.includes(signal)) matched.push(signal)
    }
  }

  return { matched, expected }
}
