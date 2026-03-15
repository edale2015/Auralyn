import {
  Disposition,
  RankedItem,
  SupervisorResult,
  UncertaintyResult,
  SeverityResult
} from '../../../shared/brainEngineTypes';

export function runDispositionCalibrationEngine(params: {
  safetyTriggered: boolean;
  supervisor: SupervisorResult;
  uncertainty: UncertaintyResult;
  severity?: SeverityResult;
  differentials: RankedItem[];
  completenessPassed: boolean;
}): { disposition: Disposition; reasons: string[] } {
  if (params.safetyTriggered) {
    return { disposition: 'er_now', reasons: ['Emergency safety rule triggered.'] };
  }
  if (params.supervisor.decision === 'BLOCK') {
    return { disposition: 'er_now', reasons: [...params.supervisor.reasons] };
  }
  if (params.supervisor.decision === 'ESCALATE') {
    return { disposition: 'needs_physician_review', reasons: [...params.supervisor.reasons] };
  }
  if (!params.completenessPassed || params.uncertainty.recommendation === 'escalate_review') {
    return { disposition: 'needs_workup', reasons: ['Insufficient certainty or incomplete complaint pathway.'] };
  }
  if (params.severity?.level === 'critical') {
    return { disposition: 'er_now', reasons: ['Critical severity score.'] };
  }
  const top = params.differentials[0]?.id;
  if (['acute_coronary_syndrome', 'stroke', 'subarachnoid_hemorrhage', 'testicular_torsion'].includes(top)) {
    return { disposition: 'er_now', reasons: ['High-acuity top differential.'] };
  }
  if (top === 'uti' || top === 'pharyngitis') {
    return { disposition: 'telemed_followup', reasons: ['Likely outpatient-manageable condition.'] };
  }
  return { disposition: 'urgent_care', reasons: ['Needs in-person evaluation.'] };
}
