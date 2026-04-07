import { clinicalSafetyGate } from "./safetyGate";
import { escalationControl, recordDisposition, EscalationStore } from "./escalationGuard";
import { getActiveSafetyConfig } from "./safetyConfigService";

// ── decisionOrchestrator ──────────────────────────────────────────────────────
//
// Explicit, boring orchestration of the full clinical decision path.
//
// The goal is to make it impossible to misread hard_stop semantics or forget
// to apply the escalation adjustment. The logic is sequenced, not distributed
// across three callers who each hope the others did the right thing.
//
// Sequence:
//  1. Load DB safety config (versioned, auditable)
//  2. Run the safety gate — fail-closed, validates all inputs
//  3. If blocked: return immediately, no escalation counters recorded
//  4. If passed: query escalation advisory
//  5. Apply probability delta (clamped to [0,1])
//  6. Resolve final disposition
//  7. Record the disposition for escalation monitoring
//
// Callers must inject an EscalationStore:
//   - RedisEscalationStore (production, scoped to tenant/clinic)
//   - InMemoryEscalationStore (dev/test)

export interface DecisionInput {
  patientId:              string;
  actorId?:               string;
  action:                 string;
  riskScore:              number;
  uncertainty?:           number;
  erReferralProbability:  number;
  proposedDisposition:    string;
}

export interface DecisionOutput {
  allowed:                     boolean;
  finalDisposition?:           string;
  finalErReferralProbability?: number;
  blockedReason?:              string;
  gateCode?:                   string;   // requiredAction from gate result
  gateConfigVersion?:          string;
  escalationReason?:           string;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export async function evaluateClinicalDecision(
  input: DecisionInput,
  store: EscalationStore,
): Promise<DecisionOutput> {
  // ── 1. Load versioned safety config from DB ───────────────────────────────
  const config = await getActiveSafetyConfig();

  // ── 2. Run fail-closed safety gate ───────────────────────────────────────
  const gate = clinicalSafetyGate(
    {
      patientId:  input.patientId,
      actorId:    input.actorId,
      action:     input.action,
      riskScore:  input.riskScore,
      uncertainty: input.uncertainty,
    },
    config,
  );

  // ── 3. Return immediately if blocked — no counters, no escalation ─────────
  if (!gate.allowed) {
    return {
      allowed:            false,
      blockedReason:      gate.reason,
      gateCode:           gate.requiredAction,
      gateConfigVersion:  gate.configVersion,
    };
  }

  // ── 4. Query escalation advisory ─────────────────────────────────────────
  const advisory = await escalationControl(store);

  // ── 5. Apply probability delta (clamped) ─────────────────────────────────
  const adjustedProbability = advisory.adjust
    ? clamp01(input.erReferralProbability + advisory.probabilityDelta)
    : input.erReferralProbability;

  // ── 6. Resolve final disposition ─────────────────────────────────────────
  const finalDisposition =
    adjustedProbability >= 0.5 ? "ER_NOW" : input.proposedDisposition;

  // ── 7. Record disposition for escalation monitoring ───────────────────────
  // Intentionally after gate passes — blocked decisions don't count toward
  // the ER rate (they weren't AI decisions, they were safety overrides).
  await recordDisposition(finalDisposition, store);

  return {
    allowed:                    true,
    finalDisposition,
    finalErReferralProbability: adjustedProbability,
    gateConfigVersion:          gate.configVersion,
    escalationReason:           advisory.reason,
  };
}
