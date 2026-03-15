import { BrainCaseInput, SafetyGuardResult } from '../../../shared/brainEngineTypes';

export function runClinicalSafetyGuard(input: BrainCaseInput): SafetyGuardResult {
  const s = new Set(input.symptoms);
  if (s.has('chest_pain') && s.has('diaphoresis')) {
    return { triggered: true, ruleIds: ['RULE_ACS'], disposition: 'er_now', reasons: ['Possible acute coronary syndrome.'] };
  }
  if (s.has('thunderclap_headache')) {
    return { triggered: true, ruleIds: ['RULE_SAH'], disposition: 'er_now', reasons: ['Thunderclap headache requires emergency imaging.'] };
  }
  if (s.has('facial_droop') || s.has('weakness_one_side')) {
    return { triggered: true, ruleIds: ['RULE_STROKE'], disposition: 'er_now', reasons: ['Possible stroke symptoms.'] };
  }
  return { triggered: false, ruleIds: [], reasons: [] };
}
