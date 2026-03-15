import type { GovernanceResult, RankedScore } from '../../shared/clinicalEngineTypes';

export function runSupervisorEngine(params: {
  governance: GovernanceResult;
  aggregatedDifferentials: RankedScore[];
  uncertaintyEntropy?: number;
  redFlags?: string[];
}) {
  const escalations: string[] = [];
  if (params.governance.decision !== 'APPROVE') escalations.push(...params.governance.rationale);
  if ((params.redFlags?.length ?? 0) > 0) escalations.push('Supervisor sees active red flags.');
  if ((params.uncertaintyEntropy ?? 0) > 1.0) escalations.push('Supervisor sees high diagnostic uncertainty.');
  return {
    supervisorDecision: escalations.length ? 'ESCALATE' : 'PASS',
    escalations,
    focusedReviewDiagnoses: params.aggregatedDifferentials.slice(0, 3),
  };
}
