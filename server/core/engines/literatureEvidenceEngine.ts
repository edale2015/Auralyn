import type { EngineScore } from './bayesianEngine';

const literatureMap: Record<string, string[]> = {
  pleuritic_pain: ['pulmonary_embolism', 'pericarditis'],
  hemoptysis: ['pulmonary_embolism', 'tuberculosis', 'lung_cancer'],
  unilateral_leg_swelling: ['deep_vein_thrombosis', 'pulmonary_embolism'],
  jaw_pain: ['acute_coronary_syndrome'],
  photophobia: ['meningitis', 'migraine'],
  rash: ['meningitis', 'viral_syndrome'],
};

export function literatureEvidenceEngine(symptoms: string[]): EngineScore[] {
  const scores: Record<string, number> = {};
  for (const s of symptoms) {
    const dxList = literatureMap[s] ?? [];
    dxList.forEach((dx, i) => {
      scores[dx] = (scores[dx] ?? 0) + 1 / (i + 1);
    });
  }
  return Object.entries(scores)
    .map(([diagnosis, score]) => ({ diagnosis, score }))
    .sort((a, b) => b.score - a.score);
}
