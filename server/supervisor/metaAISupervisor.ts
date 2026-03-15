import type { SupervisorState, MetaSupervisorResult, SupervisorDecision } from '../research/types/researchTypes';

const BLOCK_DISPOSITIONS = new Set(['ER_NOW', 'BLOCK']);
const HIGH_RISK_DIAGNOSES = new Set([
  'aortic_dissection', 'subarachnoid_hemorrhage', 'meningitis',
  'pulmonary_embolism', 'acute_coronary_syndrome', 'sepsis',
]);

export function metaAISupervisor(state: SupervisorState): MetaSupervisorResult {
  const flags: string[] = [];
  const recommendedActions: string[] = [];

  // ── Entropy check ─────────────────────────────────────────────────────────
  if ((state.entropy ?? 0) > 1.5) {
    flags.push('Very high diagnostic uncertainty (entropy > 1.5)');
    recommendedActions.push('Gather additional history and physical exam findings');
  } else if ((state.entropy ?? 0) > 1.2) {
    flags.push('High diagnostic uncertainty (entropy > 1.2)');
    recommendedActions.push('Consider ordering targeted diagnostics to narrow differential');
  }

  // ── Missing tests ─────────────────────────────────────────────────────────
  if (!state.tests || state.tests.length === 0) {
    flags.push('No diagnostic tests proposed');
    recommendedActions.push('Review clinical guidelines for applicable test recommendations');
  }

  // ── Red flags ─────────────────────────────────────────────────────────────
  if (state.redFlags && state.redFlags.length > 0) {
    flags.push(`Red flag symptoms detected: ${state.redFlags.join(', ')}`);
    recommendedActions.push('Immediate physician review required for red flag presentation');
  }

  // ── Safety trigger ────────────────────────────────────────────────────────
  if (state.safetyTriggered) {
    flags.push('Safety guard triggered — life-threatening presentation possible');
    recommendedActions.push('Activate emergency protocol and escalate to physician immediately');
  }

  // ── ER disposition without review ────────────────────────────────────────
  if (state.disposition && BLOCK_DISPOSITIONS.has(state.disposition)) {
    flags.push(`High-acuity disposition: ${state.disposition}`);
    recommendedActions.push('Confirm ER disposition with physician before patient departure');
  }

  // ── High-risk diagnosis in differentials ─────────────────────────────────
  const topDx = state.differentials?.find((d) => d.score > 0.4 && HIGH_RISK_DIAGNOSES.has(d.diagnosis));
  if (topDx) {
    flags.push(`High-risk diagnosis with significant probability: ${topDx.diagnosis} (${Math.round(topDx.score * 100)}%)`);
    recommendedActions.push(`Urgent workup for ${topDx.diagnosis} indicated`);
  }

  // ── Question completeness ─────────────────────────────────────────────────
  if ((state.questionCompleteness ?? 1) < 0.5) {
    flags.push('Less than 50% of clinical questions answered');
    recommendedActions.push('Continue intake questionnaire before final disposition');
  }

  // ── Final decision ────────────────────────────────────────────────────────
  let supervisorDecision: SupervisorDecision;
  let escalationReason: string | undefined;

  if (state.safetyTriggered || flags.some((f) => f.includes('life-threatening') || f.includes('emergency'))) {
    supervisorDecision = 'BLOCK';
    escalationReason = 'Safety guard or emergency protocol triggered — autonomous action blocked';
  } else if (flags.length >= 2 || topDx || (state.entropy ?? 0) > 1.2) {
    supervisorDecision = 'REVIEW_REQUIRED';
    escalationReason = `${flags.length} concern(s) flagged requiring physician review`;
  } else {
    supervisorDecision = 'APPROVED';
  }

  const confidence: MetaSupervisorResult['confidence'] =
    flags.length === 0 ? 'high' : flags.length <= 2 ? 'moderate' : 'low';

  if (recommendedActions.length === 0) recommendedActions.push('No immediate action required — case can proceed normally');

  return { supervisorDecision, flags, escalationReason, recommendedActions, confidence };
}
