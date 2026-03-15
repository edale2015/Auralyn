export interface EngineScore { diagnosis: string; score: number; }

const symptomDxMap: Record<string, string[]> = {
  dysuria: ['uti', 'pyelonephritis'],
  urinary_frequency: ['uti'],
  cough: ['pneumonia', 'bronchitis', 'covid'],
  fever: ['pneumonia', 'uti', 'pharyngitis', 'covid'],
  sore_throat: ['pharyngitis', 'tonsillitis'],
  chest_pain: ['acute_coronary_syndrome', 'pulmonary_embolism', 'pneumonia'],
  shortness_of_breath: ['pulmonary_embolism', 'pneumonia', 'asthma'],
  diaphoresis: ['acute_coronary_syndrome', 'sepsis'],
  headache: ['meningitis', 'migraine'],
  stiff_neck: ['meningitis'],
  ear_pain: ['otitis_media', 'otitis_externa'],
};

export function bayesianEngine(symptoms: string[]): EngineScore[] {
  const scores: Record<string, number> = {};
  for (const s of symptoms) {
    const dxList = symptomDxMap[s] ?? [];
    dxList.forEach((dx, i) => {
      scores[dx] = (scores[dx] ?? 0) + 1 / (i + 1);
    });
  }
  return Object.entries(scores)
    .map(([diagnosis, score]) => ({ diagnosis, score }))
    .sort((a, b) => b.score - a.score);
}
