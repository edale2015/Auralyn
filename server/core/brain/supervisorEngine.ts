import { SupervisorResult } from '../../../shared/brainEngineTypes';

export function runSupervisorEngine(params: {
  safetyTriggered: boolean;
  contradictionErrors: string[];
  highEntropy: boolean;
  severityLevel?: string;
  protocolMajor: boolean;
  completenessPassed: boolean;
  guidelineMajor: boolean;
  driftMajor: boolean;
}): SupervisorResult {
  const reasons: string[] = [];
  if (params.contradictionErrors.length) {
    return { decision: 'BLOCK', reasons: params.contradictionErrors };
  }
  if (params.safetyTriggered) {
    return { decision: 'BLOCK', reasons: ['Safety override triggered.'] };
  }
  if (params.severityLevel === 'critical') reasons.push('Critical severity.');
  if (params.highEntropy) reasons.push('High diagnostic uncertainty.');
  if (!params.completenessPassed) reasons.push('Incomplete pathway.');
  if (params.protocolMajor || params.guidelineMajor || params.driftMajor) reasons.push('Major governance variance.');
  if (reasons.length) return { decision: 'ESCALATE', reasons };
  return { decision: 'PASS', reasons: [] };
}
