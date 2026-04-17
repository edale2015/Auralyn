# Disposition and Safety Core

## Review Prompt

This is the core safety layer. It determines whether a patient is sent home vs escalated.
CRITICAL — review for:
  - Unsafe under-triage risk
  - Logic gaps in red flag handling
  - Conflicts between hallucination guards
  - Any code path where a dangerous case could incorrectly pass all gates

FILE NOT FOUND entries = components the architecture expects but are absent.

## Files

---

### Final Meta Question (ask after reviewing)

List the **TOP 5 MOST DANGEROUS FAILURE MODES** in this section.
Be specific. Do not give generic advice. Focus on real-world clinical risk.

### server/clinical/dispositionEngine.ts

```ts
// FILE NOT FOUND: server/clinical/dispositionEngine.ts
```

### server/ai/safetyGovernor.ts

```ts
// FILE NOT FOUND: server/ai/safetyGovernor.ts
```

### server/ai/hallucinationGuards.ts

```ts
// FILE NOT FOUND: server/ai/hallucinationGuards.ts
```

### server/ai/hallucinationExtensions.ts

```ts
/**
 * Hallucination extension guards — five additional safety checks beyond
 * the core hallucinationGuards.ts module.
 *
 * All guards return ExtraGuardResult, which is composable with the
 * main disposition pipeline.
 */

export interface ExtraGuardResult {
  blocked: boolean;
  abstain: boolean;
  reasons: string[];
}

type Observation = { feature: string; value: unknown };

// ─── 1. Impossible physiologic combination ─────────────────────────────────

const IMPOSSIBLE_COMBOS: Array<[string, string, string]> = [
  ["hypotension",   "normal_perfusion", "Hypotension + normal perfusion is physiologically impossible"],
  ["bradycardia",   "tachycardia",      "Bradycardia and tachycardia cannot coexist"],
  ["apnea",         "normal_breathing", "Apnea and normal breathing cannot coexist"],
  ["severe_anemia", "normal_hgb",       "Severe anaemia and normal haemoglobin cannot coexist"],
];

export function detectImpossibleCombo(observations: Observation[]): ExtraGuardResult {
  const features = new Set(observations.map((o) => o.feature));

  for (const [a, b, reason] of IMPOSSIBLE_COMBOS) {
    if (features.has(a) && features.has(b)) {
      return { blocked: true, abstain: false, reasons: [reason] };
    }
  }
  return { blocked: false, abstain: false, reasons: [] };
}

// ─── 2. Confidence compression (anti-overconfidence) ───────────────────────

const CONF_FLOOR = 0.2;
const CONF_CEIL  = 0.8;

export function compressConfidence(prob: number): number {
  if (prob > CONF_CEIL) return CONF_CEIL;
  if (prob < CONF_FLOOR) return CONF_FLOOR;
  return prob;
}

// ─── 3. Multi-diagnosis coverage requirement ────────────────────────────────

export function requireDifferentialSpread(
  posterior: Record<string, number>,
): ExtraGuardResult {
  const top3 = Object.values(posterior)
    .sort((a, b) => b - a)
    .slice(0, 3);

  if (top3.length < 3) return { blocked: false, abstain: false, reasons: [] };

  const spread = (top3[0] ?? 0) - (top3[2] ?? 0);

  if (spread < 0.2) {
    return {
      blocked: false,
      abstain: true,
      reasons: ["Differential spread < 0.2 — diagnosis uncertainty too high for autonomous action"],
    };
  }
  return { blocked: false, abstain: false, reasons: [] };
}

// ─── 4. Dangerous-condition rule-out check ─────────────────────────────────

const DANGEROUS_DX = ["pe", "acs", "stroke", "sepsis", "meningitis", "aortic_dissection"];
const DX_POSTERIOR_THRESHOLD = 0.1;

export function ensureDangerousRuledOut(
  topDx: string,
  posterior: Record<string, number>,
): ExtraGuardResult {
  const reasons: string[] = [];

  for (const dx of DANGEROUS_DX) {
    const prob = posterior[dx] ?? 0;
    if (prob > DX_POSTERIOR_THRESHOLD && topDx !== dx) {
      reasons.push(`Dangerous condition '${dx}' (P=${prob.toFixed(2)}) not yet ruled out`);
    }
  }

  return {
    blocked: reasons.length > 0,
    abstain: false,
    reasons,
  };
}

// ─── 5. Temporal consistency check ─────────────────────────────────────────

export function checkTemporalConsistency(observations: Observation[]): ExtraGuardResult {
  const featureMap = new Map(observations.map((o) => [o.feature, o.value]));

  const onset    = featureMap.get("onset_hours");
  const duration = featureMap.get("duration_days");

  const reasons: string[] = [];

  if (typeof onset === "number" && typeof duration === "number") {
    if (onset > 24 && duration < 1) {
      reasons.push(
        `Temporal inconsistency: onset_hours=${onset} but duration_days=${duration} (< 1 day)`,
      );
    }
  }

  return { blocked: reasons.length > 0, abstain: false, reasons };
}

// ─── 6. Risk floor enforcement ─────────────────────────────────────────────

const SEVERITY_ORDER: Record<string, number> = {
  home:                       0,
  urgent_care:                1,
  physician_review_required:  2,
  ed:                         3,
  call_911:                   4,
};

export function applyRiskFloor(
  topDiagnosis: string,
  proposedDisposition: string,
  riskFloors: Record<string, string>,
): ExtraGuardResult {
  const minimum = riskFloors[topDiagnosis];
  if (!minimum) return { blocked: false, abstain: false, reasons: [] };

  const proposed = SEVERITY_ORDER[proposedDisposition] ?? 0;
  const floor    = SEVERITY_ORDER[minimum]             ?? 0;

  if (proposed < floor) {
    return {
      blocked: true,
      abstain: false,
      reasons: [`Disposition '${proposedDisposition}' below risk floor '${minimum}' for ${topDiagnosis}`],
    };
  }
  return { blocked: false, abstain: false, reasons: [] };
}

// ─── 7. Low-support abstention ─────────────────────────────────────────────

export function lowSupportAbstention(
  evidenceCoverageScore: number,
  contradictionScore:    number,
  posteriorTopProb:      number,
): ExtraGuardResult {
  const reasons: string[] = [];

  if (evidenceCoverageScore < 0.2) reasons.push("Evidence coverage too low (< 0.2)");
  if (contradictionScore    > 0.5) reasons.push("Contradiction burden too high (> 0.5)");
  if (posteriorTopProb      < 0.35) reasons.push("Posterior top probability too low (< 0.35)");

  return { blocked: false, abstain: reasons.length > 0, reasons };
}
```

### server/clinical/finalDecisionEngine.ts

```ts
/**
 * Packet 12 — Canonical Final Decision Engine
 *
 * Single deterministic pipeline — strictly ordered, fail-closed, audit-ready.
 * No competing authority paths; every step is explicit and traceable.
 *
 * Pipeline order:
 *   1. Initial disposition  (deriveDisposition)
 *   2. Risk override        (applyRiskOverride)
 *   3. Safety gate          (clinicalSafetyGate)    — FAIL CLOSED
 *   4. Physician checkpoint (createOrCheckCheckpoint) — FAIL CLOSED on timeout
 *   5. Escalation advisory  (escalationControl)
 *   6. Final disposition    (probabilityThreshold)
 *   7. Record outcome       (recordDisposition)
 */

import {
  type PosteriorAnalysis,
  applyRiskOverride,
  deriveDisposition,
} from "./posteriorAnalysis";

import {
  clinicalSafetyGate,
  type SafetyGateConfig,
  DEFAULT_SAFETY_CONFIG,
} from "./safetyGate";

import {
  requiresPhysicianApproval,
  createPhysicianApprovalRequest,
  getAllApprovals,
  type PhysicianApprovalRecord,
  DISPOSITIONS_REQUIRING_APPROVAL,
} from "../compliance/physicianCheckpoint";

import {
  escalationControl,
  recordDisposition,
  type EscalationStore,
  InMemoryEscalationStore,
} from "./escalationGuard";

// ── Constants ─────────────────────────────────────────────────────────────────

const MODEL_VERSION = "1.0.0";
const ER_PROBABILITY_THRESHOLD = 0.5;

export const FINAL_DECISION_MODEL_VERSION = MODEL_VERSION;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DecisionCheckpoint {
  required: boolean;
  status: "pending" | "approved" | "rejected" | "expired";
  approvalId?: string;
}

export interface DecisionContext {
  caseId: string;
  patientId?: string;

  posterior: PosteriorAnalysis;

  initialDisposition: string;
  riskOverrideApplied: boolean;

  safety: {
    allowed: boolean;
    code: string;
    reason: string;
  };

  checkpoint?: DecisionCheckpoint;

  finalDisposition?: string;

  trace: string[];
}

export interface FinalDecisionInput {
  state: {
    caseId: string;
    patientId?: string;
    symptoms: string[];
    scores?: Record<string, number>;
  };
  posterior: PosteriorAnalysis;
  erProbability: number;
  store?: EscalationStore;
  safetyConfig?: SafetyGateConfig;
}

// ── computeFinalDecision ──────────────────────────────────────────────────────
//
// FAIL-CLOSED: any blocked step terminates early and sets finalDisposition
// to a safe value. Never silently drifts forward on uncertainty.

export async function computeFinalDecision(
  input: FinalDecisionInput,
): Promise<DecisionContext> {
  const store = input.store ?? new InMemoryEscalationStore();
  const safetyConfig = input.safetyConfig ?? DEFAULT_SAFETY_CONFIG;

  const ctx: DecisionContext = {
    caseId: input.state.caseId,
    patientId: input.state.patientId,
    posterior: input.posterior,
    initialDisposition: "",
    riskOverrideApplied: false,
    safety: { allowed: false, code: "", reason: "" },
    trace: [],
  };

  // ── Step 1: Initial disposition ───────────────────────────────────────────
  const clinicalDecision = deriveDisposition(
    input.posterior,
    input.state.symptoms,
  );
  ctx.initialDisposition = clinicalDecision.disposition;
  ctx.trace.push(`Initial disposition: ${ctx.initialDisposition}`);

  // ── Step 2: Risk override ─────────────────────────────────────────────────
  if (applyRiskOverride(input.posterior)) {
    ctx.initialDisposition = "ER_NOW";
    ctx.riskOverrideApplied = true;
    ctx.trace.push("Risk override applied → ER_NOW");
  }

  // ── Step 3: Safety gate — FAIL CLOSED ────────────────────────────────────
  const safetyResult = clinicalSafetyGate(
    {
      riskScore: input.erProbability,
      patientId: input.state.patientId,
      action: "disposition",
    },
    safetyConfig,
  );

  ctx.safety = {
    allowed: safetyResult.allowed,
    code: safetyResult.requiredAction ?? (safetyResult.allowed ? "PASS" : "BLOCK"),
    reason: safetyResult.reason,
  };

  ctx.trace.push(
    `Safety gate: ${ctx.safety.code} — ${safetyResult.reason}`,
  );

  if (!safetyResult.allowed) {
    ctx.finalDisposition = "BLOCKED";
    ctx.trace.push("Safety gate blocked — fail-closed → BLOCKED");
    return ctx;
  }

  // ── Step 4: Physician checkpoint — FAIL CLOSED on timeout/rejection ───────
  if (requiresPhysicianApproval(ctx.initialDisposition)) {
    const checkpoint = await createOrCheckCheckpoint(ctx);
    ctx.checkpoint = checkpoint;
    ctx.trace.push(`Checkpoint: ${checkpoint.status}`);

    if (checkpoint.status === "pending") {
      ctx.finalDisposition = "AWAITING_PHYSICIAN";
      return ctx;
    }

    if (checkpoint.status === "rejected") {
      ctx.finalDisposition = "REJECTED_BY_PHYSICIAN";
      return ctx;
    }

    if (checkpoint.status === "expired") {
      ctx.finalDisposition = "ESCALATED_NO_RESPONSE";
      return ctx;
    }
    // status === "approved" — continue pipeline
  }

  // ── Step 5: Escalation advisory ───────────────────────────────────────────
  const advisory = await escalationControl(store);
  let finalProb = input.erProbability;

  if (advisory.adjust) {
    finalProb = Math.max(0, Math.min(1, finalProb + advisory.probabilityDelta));
    ctx.trace.push(
      `Escalation adjustment applied: Δ${advisory.probabilityDelta} — ${advisory.reason}`,
    );
  }

  // ── Step 6: Final disposition ─────────────────────────────────────────────
  ctx.finalDisposition =
    finalProb >= ER_PROBABILITY_THRESHOLD ? "ER_NOW" : ctx.initialDisposition;
  ctx.trace.push(`Final disposition: ${ctx.finalDisposition}`);

  // ── Step 7: Record outcome ────────────────────────────────────────────────
  await recordDisposition(ctx.finalDisposition, store);

  return ctx;
}

// ── createOrCheckCheckpoint ──────────────────────────────────────────────────
//
// Key rules:
//   • Never auto-approve
//   • Timeout = ESCALATED_NO_RESPONSE (not approved)
//   • Idempotent: re-uses existing pending record for the caseId

export async function createOrCheckCheckpoint(
  ctx: Pick<DecisionContext, "caseId" | "patientId" | "posterior" | "initialDisposition">,
): Promise<DecisionCheckpoint> {
  const existing = getAllApprovals().find(r => r.caseId === ctx.caseId);

  if (existing) {
    if (existing.status === "TIMED_OUT") {
      return { required: true, status: "expired", approvalId: existing.approvalId };
    }
    if (existing.status === "APPROVED") {
      return { required: true, status: "approved", approvalId: existing.approvalId };
    }
    if (existing.status === "OVERRIDDEN") {
      return { required: true, status: "rejected", approvalId: existing.approvalId };
    }
    // PENDING — check if it has since timed out
    if (Date.now() > new Date(existing.timeoutAt).getTime()) {
      return { required: true, status: "expired", approvalId: existing.approvalId };
    }
    return { required: true, status: "pending", approvalId: existing.approvalId };
  }

  // No existing record — create a new checkpoint request
  const record = await createPhysicianApprovalRequest({
    caseId: ctx.caseId,
    disposition: ctx.initialDisposition as any,
    modelVersion: MODEL_VERSION,
    agentWeights: {},
    confidenceScore: ctx.posterior.topPosterior,
    redFlagsEvaluated: [],
  });

  return { required: true, status: "pending", approvalId: record.approvalId };
}

// ── buildPatientResponse ─────────────────────────────────────────────────────
//
// Never exposes raw internal state. Clinical text only.

export function buildPatientResponse(ctx: DecisionContext): string {
  switch (ctx.finalDisposition) {
    case "BLOCKED":
      return "We need additional review before making a recommendation.";

    case "AWAITING_PHYSICIAN":
      return "A clinician is reviewing your case. Please wait.";

    case "REJECTED_BY_PHYSICIAN":
      return "A clinician has reviewed your case and recommended a different approach. Please follow up with your provider.";

    case "ER_NOW":
      return "Please seek emergency care immediately.";

    case "ESCALATED_NO_RESPONSE":
      return "We recommend urgent evaluation. Please go to the nearest emergency department.";

    case "NEEDS_MORE_DATA":
      return "We need a bit more information to give you accurate guidance.";

    case "URGENT_CARE":
      return "Based on your symptoms, we recommend being seen at an urgent care center today.";

    case "HOME":
      return "Based on your symptoms, home care is appropriate. Monitor your symptoms and follow up if they worsen.";

    default:
      return "We need additional review before making a recommendation.";
  }
}

// ── getTestEscalationStore ────────────────────────────────────────────────────
// Convenience factory for test harness use.

export function getTestEscalationStore(): EscalationStore {
  return new InMemoryEscalationStore();
}
```

# [Continues in 03b_disposition_pipeline.md]
