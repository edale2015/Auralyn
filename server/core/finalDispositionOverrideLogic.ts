import type { Disposition } from '../../shared/clinicalEngineTypes';

export function applyFinalDispositionOverrideLogic(
  current: Disposition,
  opts: {
    safetyTriggered?: boolean;
    supervisorDecision?: string;
    topDiagnosis?: string;
    confidence?: number;
  }
): Disposition {
  if (opts.safetyTriggered) return 'ER_NOW';
  if (opts.supervisorDecision === 'BLOCK') return 'BLOCK';
  if (opts.supervisorDecision === 'ESCALATE') return 'NEEDS_PHYSICIAN_REVIEW';
  if (opts.topDiagnosis === 'acute_coronary_syndrome') return 'ER_NOW';
  if ((opts.confidence || 0) < 0.45 && current === 'HOME_CARE') return 'VIDEO_VISIT';
  return current;
}
