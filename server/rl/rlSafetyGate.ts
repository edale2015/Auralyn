/**
 * RL Safety Gate — prevents RL engine from recommending forbidden clinical actions
 * RL can RECOMMEND but cannot override clinical rules or agent scope.
 * Forbidden actions always require physician review regardless of Q-value.
 */

import type { ClinicalAction } from "./rlEngine";

// Actions the RL engine is NEVER allowed to auto-execute
const FORBIDDEN_ACTIONS: string[] = [
  "prescribe_antibiotics",
  "discharge_patient",
  "override_physician",
  "modify:billing",
  "delete:patient_data",
];

// Actions requiring physician cosign before execution
const RESTRICTED_ACTIONS: string[] = [
  "escalate_ICU",
  "transfer_hospital",
];

export interface SafetyGateResult {
  safe:                boolean;
  requiresPhysician:   boolean;
  reason?:             string;
  action:              string;
}

export function validateRLAction(action: string): SafetyGateResult {
  if (FORBIDDEN_ACTIONS.includes(action)) {
    return { safe: false, requiresPhysician: false, reason: `Action "${action}" is explicitly forbidden for RL engine`, action };
  }

  if (RESTRICTED_ACTIONS.includes(action)) {
    return { safe: true, requiresPhysician: true, reason: `Action "${action}" requires physician cosign before execution`, action };
  }

  return { safe: true, requiresPhysician: false, action };
}

export function filterSafeActions(actions: ClinicalAction[]): ClinicalAction[] {
  return actions.filter((a) => validateRLAction(a).safe);
}

export function getForbiddenActions(): string[] { return [...FORBIDDEN_ACTIONS]; }
export function getRestrictedActions(): string[] { return [...RESTRICTED_ACTIONS]; }
