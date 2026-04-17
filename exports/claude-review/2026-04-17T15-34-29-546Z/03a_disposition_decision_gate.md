# Disposition & Safety Core (MOST CRITICAL)

## Review Prompt

This is the core safety layer. It determines whether a patient is sent home vs escalated.
CRITICAL — review for:
  - Unsafe under-triage risk (patient sent home when they should be escalated)
  - Logic gaps in red flag detection
  - Conflicts between hallucination guards
  - Any code path where a dangerous case could incorrectly pass all gates
  - Race conditions between safety checks

## Files

---

### Final Meta Question (ask after reviewing)

List the **TOP 5 MOST DANGEROUS FAILURE MODES** in this section.
Be specific. Do not give generic advice. Focus on real-world clinical risk.

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

### server/clinical/safetyGate.ts

```ts
import { auditLog } from "../security/auditLogger";

// ── Threshold configuration ───────────────────────────────────────────────────
//
// In production, thresholds must be loaded from the safety_configs table via
// safetyConfigService.getActiveSafetyConfig() so every change is versioned,
// authorized, and auditable under FDA 21 CFR Part 11.
//
// DEFAULT_CONFIG is kept as the absolute fallback for local dev and unit tests.
// callers in production should always pass a DB-loaded config.

export interface SafetyGateConfig {
  riskThreshold:        number;
  hardStopThreshold:    number;
  uncertaintyThreshold: number;
  configVersion:        string;
}

export const DEFAULT_SAFETY_CONFIG: SafetyGateConfig = {
  riskThreshold:        0.6,
  hardStopThreshold:    0.95,
  uncertaintyThreshold: 0.3,
  configVersion:        "1.0.0",
};

export interface SafetyGateInput {
  riskScore:   number;
  uncertainty?: number;
  action?:     string;
  patientId?:  string;
  actorId?:    string;
}

export interface SafetyGateResult {
  allowed:         boolean;
  reason:          string;
  requiredAction?: "physician_review" | "confidence_boost" | "hard_stop" | "input_error";
  configVersion:   string;
}

// ── clinicalSafetyGate ────────────────────────────────────────────────────────
//
// FAIL-CLOSED: any exception, invalid input, or unrecognized state blocks.
// Never returns allowed:true unless all checks explicitly pass.
// Callers must treat a thrown exception the same as allowed:false.
//
// FIXED vs original:
//  1. No input validation — NaN, -0.5, Infinity silently passed. Fixed.
//  2. No try/catch — auditLog throwing (DB down) caused unhandled exception
//     that may have caused fail-open depending on caller. Fixed.
//  3. Magic numbers in source — thresholds now in SafetyGateConfig with
//     configVersion for audit trail. Fixed.
//  4. Missing "input_error" requiredAction — callers had no way to distinguish
//     invalid input from a real clinical block. Fixed.
//  5. result.reason was sometimes undefined — now always a non-empty string.

export function clinicalSafetyGate(
  decision: SafetyGateInput,
  config: SafetyGateConfig = DEFAULT_SAFETY_CONFIG,
): SafetyGateResult {
  try {
    const { riskScore, uncertainty = 0, patientId, actorId, action } = decision;
    const actor = actorId ?? "system";
    const cv    = config.configVersion;

    // ── Config sanity check ───────────────────────────────────────────────────
    // Misconfigured thresholds must be caught here, not discovered during a
    // patient's hard-stop event. Throw so the caller gets an immediate error.
    if (config.riskThreshold >= config.hardStopThreshold) {
      throw new Error(
        `SafetyGate misconfiguration: riskThreshold (${config.riskThreshold}) ` +
        `must be strictly less than hardStopThreshold (${config.hardStopThreshold})`
      );
    }

    // ── Input validation ──────────────────────────────────────────────────────
    // NaN >= 0.95 is false — NaN silently passed the old hard-stop check.
    // -0.5 < 0.6 is true — negative scores silently passed all checks.
    // Any non-finite or out-of-range value is a model/caller defect; block it.
    if (
      typeof riskScore !== "number" ||
      !isFinite(riskScore)          ||
      riskScore < 0                 ||
      riskScore > 1
    ) {
      try {
        auditLog({
          actor, action: "safety_gate_input_error", patientId,
          riskScore, details: { reason: "Invalid riskScore", input: action, configVersion: cv },
        });
      } catch { /* audit failure must not suppress the block */ }
      return {
        allowed: false,
        reason: `Invalid riskScore ${riskScore} — must be a finite number in [0, 1].`,
        requiredAction: "input_error",
        configVersion:  cv,
      };
    }

    if (
      typeof uncertainty !== "number" ||
      !isFinite(uncertainty)          ||
      uncertainty < 0                 ||
      uncertainty > 1
    ) {
      try {
        auditLog({
          actor, action: "safety_gate_input_error", patientId,
          riskScore, details: { reason: "Invalid uncertainty", uncertainty, input: action, configVersion: cv },
        });
      } catch { /* audit failure must not suppress the block */ }
      return {
        allowed: false,
        reason: `Invalid uncertainty ${uncertainty} — must be a finite number in [0, 1].`,
        requiredAction: "input_error",
        configVersion:  cv,
      };
    }

    // ── Hard stop — no physician override ─────────────────────────────────────
    if (riskScore >= config.hardStopThreshold) {
      try {
        auditLog({
          actor, action: "safety_gate_hard_stop", patientId, riskScore,
          details: { reason: "Extreme risk score", input: action, configVersion: cv },
        });
      } catch { /* audit failure must not suppress the block */ }
      return {
        allowed: false,
        reason:  "Extreme risk — hard stop. Immediate physician escalation required. No AI override permitted.",
        requiredAction: "hard_stop",
        configVersion:  cv,
      };
    }

    // ── Physician review required ─────────────────────────────────────────────
    if (riskScore > config.riskThreshold) {
      try {
        auditLog({
          actor, action: "safety_gate_blocked", patientId, riskScore,
          details: { reason: "Risk score exceeds threshold", input: action, configVersion: cv },
        });
      } catch { /* audit failure must not suppress the block */ }
      return {
        allowed: false,
        reason:  `Risk score ${riskScore.toFixed(3)} exceeds threshold ${config.riskThreshold}. Physician review required.`,
        requiredAction: "physician_review",
        configVersion:  cv,
      };
    }

    // ── Uncertainty too high ──────────────────────────────────────────────────
    if (uncertainty > config.uncertaintyThreshold) {
      try {
        auditLog({
          actor, action: "safety_gate_blocked", patientId, riskScore,
          details: { reason: "Model uncertainty too high", uncertainty, input: action, configVersion: cv },
        });
      } catch { /* audit failure must not suppress the block */ }
      return {
        allowed: false,
        reason:  `Model uncertainty ${uncertainty.toFixed(3)} exceeds threshold ${config.uncertaintyThreshold}. Additional data required.`,
        requiredAction: "confidence_boost",
        configVersion:  cv,
      };
    }

    // ── All checks passed ─────────────────────────────────────────────────────
    try {
      auditLog({
        actor, action: "safety_gate_passed", patientId, riskScore,
        details: { uncertainty, input: action, configVersion: cv },
      });
    } catch { /* audit failure must not suppress a valid pass */ }

    return {
      allowed: true,
      reason:  "All safety checks passed.",
      configVersion: cv,
    };

  } catch (err) {
    // ── Fail closed on any unhandled exception ────────────────────────────────
    // An exception in the gate itself (e.g. misconfigured thresholds, unexpected
    // throw from auditLog) must result in a block, never a pass.
    try {
      auditLog({
        actor:    decision.actorId ?? "system",
        action:   "safety_gate_exception",
        patientId: decision.patientId,
        riskScore: decision.riskScore,
        details:  { error: err instanceof Error ? err.message : String(err) },
      });
    } catch {
      console.error("[SafetyGate] CRITICAL: audit log failed during exception handler", err);
    }
    return {
      allowed: false,
      reason:  "Safety gate internal error. Decision blocked as a precaution.",
      requiredAction: "physician_review",
      configVersion:  DEFAULT_SAFETY_CONFIG.configVersion,
    };
  }
}

// ── Batch variant ─────────────────────────────────────────────────────────────
// Each call is independent and fail-closed. A single bad input does not affect
// the others — each result carries its own allowed/blocked status.

export function batchSafetyCheck(
  decisions: SafetyGateInput[],
  config: SafetyGateConfig = DEFAULT_SAFETY_CONFIG,
): SafetyGateResult[] {
  return decisions.map(d => clinicalSafetyGate(d, config));
}
```

