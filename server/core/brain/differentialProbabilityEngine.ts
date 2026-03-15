import { BrainCaseInput, RankedItem } from '../../../shared/brainEngineTypes';

const PRIORS: Record<string, number> = {
  acute_coronary_syndrome: 0.09,
  pulmonary_embolism: 0.05,
  uti: 0.16,
  pyelonephritis: 0.07,
  pharyngitis: 0.18,
  influenza: 0.15,
  pneumonia: 0.1,
  meningitis: 0.02,
  subarachnoid_hemorrhage: 0.01,
  testicular_torsion: 0.01,
  stroke: 0.03
};

const LR: Record<string, Record<string, number>> = {
  chest_pain: { acute_coronary_syndrome: 3.5, pulmonary_embolism: 1.8 },
  diaphoresis: { acute_coronary_syndrome: 2.8 },
  dysuria: { uti: 3.7, pyelonephritis: 1.4 },
  urinary_frequency: { uti: 2.5 },
  flank_pain: { pyelonephritis: 3.2 },
  sore_throat: { pharyngitis: 3.5, influenza: 2.0 },
  fever: { influenza: 2.5, pyelonephritis: 2.2, pneumonia: 2.1 },
  productive_cough: { pneumonia: 3.0 },
  neck_stiffness: { meningitis: 6.0 },
  thunderclap_headache: { subarachnoid_hemorrhage: 9.0 },
  unilateral_testicular_pain: { testicular_torsion: 8.0 },
  facial_droop: { stroke: 5.0 },
  weakness_one_side: { stroke: 6.0 }
};

export function runBayesianDifferentialEngine(input: BrainCaseInput): RankedItem[] {
  const logs = Object.fromEntries(Object.entries(PRIORS).map(([dx, p]) => [dx, Math.log(p)]));
  for (const symptom of input.symptoms) {
    const map = LR[symptom] || {};
    for (const [dx, lr] of Object.entries(map)) {
      logs[dx] = (logs[dx] || Math.log(0.001)) + Math.log(lr);
    }
  }
  const maxLog = Math.max(...Object.values(logs));
  const exps = Object.fromEntries(Object.entries(logs).map(([dx, l]) => [dx, Math.exp(l - maxLog)]));
  const sum = Object.values(exps).reduce((a, b) => a + b, 0) || 1;
  return Object.entries(exps)
    .map(([id, x]) => ({ id, score: x / sum, source: 'bayes' }))
    .sort((a, b) => b.score - a.score);
}
