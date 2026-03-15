import { runClinicalSuperBrain, type SuperBrainInput } from '../core/clinicalSuperBrain';

export interface SimulationSummary {
  total: number;
  escalated: number;
  reviewed: number;
  passed: number;
  avgEntropy: number;
  avgSeverity: number;
}

export async function massSimulationEngine(cases: SuperBrainInput[]): Promise<SimulationSummary> {
  let escalated = 0, reviewed = 0, passed = 0;
  let totalEntropy = 0, totalSeverity = 0;

  for (const c of cases) {
    const r = await runClinicalSuperBrain(c);
    totalEntropy += r.entropy;
    totalSeverity += r.severity;
    if (r.governance.decision === 'ESCALATE') escalated++;
    else if (r.governance.decision === 'REVIEW') reviewed++;
    else passed++;
  }

  return {
    total: cases.length,
    escalated,
    reviewed,
    passed,
    avgEntropy: cases.length ? totalEntropy / cases.length : 0,
    avgSeverity: cases.length ? totalSeverity / cases.length : 0,
  };
}
