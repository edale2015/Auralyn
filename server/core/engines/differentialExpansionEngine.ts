import type { EngineScore } from './bayesianEngine';

const expansionMap: Record<string, string[]> = {
  uti: ['pyelonephritis', 'vaginitis'],
  pneumonia: ['covid', 'bronchitis', 'pleural_effusion'],
  acute_coronary_syndrome: ['unstable_angina', 'myocardial_infarction'],
  pharyngitis: ['tonsillitis', 'peritonsillar_abscess'],
  meningitis: ['encephalitis', 'subarachnoid_hemorrhage'],
};

export function differentialExpansionEngine(primary: EngineScore[]): EngineScore[] {
  const expanded: EngineScore[] = [...primary];
  for (const d of primary) {
    const extras = expansionMap[d.diagnosis] ?? [];
    for (const e of extras) {
      if (!expanded.find((x) => x.diagnosis === e)) {
        expanded.push({ diagnosis: e, score: d.score * 0.4 });
      }
    }
  }
  return expanded.sort((a, b) => b.score - a.score);
}
