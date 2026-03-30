/**
 * ============================================================
 * DOMAIN 2: FDA SaMD & HIPAA COMPLIANCE — Interface Contracts
 * Auralyn / ENT Flu Slice — HIPAA/FDA Medical Triage Platform
 * ============================================================
 *
 * What is here: TypeScript interfaces, enums, constants, and
 * function signatures only. No implementation bodies.
 *
 * Files this represents:
 *   server/compliance/physicianCheckpoint.ts
 *   server/compliance/policyProposalGate.ts
 *   server/audit/auditVerifier.ts
 *   server/compliance/hipaaBreachRegister.ts
 *   server/audit/auditLogger.ts   (existing — shown for context)
 *   server/audit/hashChain.ts     (existing — shown for context)
 *
 * REVIEW QUESTIONS FOR CLAUDE:
 *   1. Is 10 minutes the right physician review timeout? Nuance
 *      DAX uses 15 minutes — what does clinical literature suggest?
 *   2. Should URGENT_CARE require physician pre-approval or is
 *      that too operationally burdensome for Class II maintenance?
 *   3. Is 72 hours the right expiry window for policy proposals?
 *   4. Does the Merkle batch verification scheme satisfy
 *      45 CFR §164.312(b) as a "mechanism to authenticate PHI"?
 *   5. Are there HIPAA breach pathways missing from the risk
 *      register that OCR has penalized other AI platforms for?
 * ============================================================
 */


// ─── 2.1 · Physician Approval Gate (P0 FDA Requirement) ──────────────────────

/**
 * Dispositions that MUST have physician approval before delivery to patient.
 * Minimum viable human-in-the-loop to maintain Class II SaMD status.
 *
 * Rationale: Without pre-approval for ER_NOW/ER_URGENT, the system is
 * operating as an autonomous diagnostic device → Class III / PMA territory.
 */
export declare const DISPOSITIONS_REQUIRING_APPROVAL: DispositionTier[];
// Currently: [ER_NOW, ER_URGENT, URGENT_CARE]

export declare const REVIEW_TIMEOUT_MINUTES: number;
// Currently: 10 minutes — on timeout, disposition auto-escalates one tier

export interface PhysicianApprovalRecord {
  approvalId:           string;
  caseId:               string;
  traceId:              string;
  proposedDisposition:  DispositionTier;

  // FDA SaMD required audit fields
  modelVersion:         string;     // which model version made this decision
  agentWeights:         Record<string, number>;  // EMA weights at time of decision
  confidenceScore:      number;
  redFlagsEvaluated:    string[];

  requestedAt:          string;     // ISO timestamp
  timeoutAt:            string;     // ISO timestamp (requestedAt + 10 min)
  status:               "PENDING" | "APPROVED" | "OVERRIDDEN" | "TIMED_OUT";

  // Populated after physician decision
  physicianId?:         string;
  reviewedAt?:          string;
  decision?:            "approved" | "overridden";
  overrideDisposition?: DispositionTier;
  overrideReason?:      string;
  timeToReviewSeconds?: number;
}

/** Returns true if this disposition requires physician pre-approval. */
export declare function requiresPhysicianApproval(disposition: string): boolean;

/**
 * Creates a pending approval record, emits PHYSICIAN_REVIEW_REQUIRED event,
 * writes audit step, and schedules auto-escalation timeout.
 */
export declare function createPhysicianApprovalRequest(params: {
  caseId:            string;
  disposition:       DispositionTier;
  modelVersion:      string;
  agentWeights:      Record<string, number>;
  confidenceScore:   number;
  redFlagsEvaluated: string[];
}): Promise<PhysicianApprovalRecord>;

/**
 * Records physician decision — approved or overridden.
 * Writes PHYSICIAN_APPROVED or PHYSICIAN_OVERRIDDEN audit step.
 * Returns null if approvalId is not found.
 */
export declare function recordPhysicianDecision(params: {
  approvalId:            string;
  physicianId:           string;
  decision:              "approved" | "overridden";
  overrideDisposition?:  DispositionTier;
  overrideReason?:       string;
}): Promise<PhysicianApprovalRecord | null>;

export declare function getPendingApprovals(): PhysicianApprovalRecord[];
export declare function getApprovalRecord(approvalId: string): PhysicianApprovalRecord | undefined;

// Note: Timeout handler auto-fires after REVIEW_TIMEOUT_MINUTES.
// On timeout: status → "TIMED_OUT", disposition escalated one tier,
// ALERT event emitted, audit step written.


// ─── 2.2 · Human-Gated Policy Promotion ──────────────────────────────────────

/**
 * Rec 2.3 — Under FDA's 2023 PCCP framework, every autonomous policy
 * update to a clinical algorithm is an unapproved device modification.
 * Policies can only be promoted via this gate — never autonomously.
 */
export type PolicyMode = "conservative" | "balanced" | "probabilistic";

export interface PolicyProposal {
  proposalId:             string;
  traceId:                string;
  candidateMode:          PolicyMode;
  currentMode:            PolicyMode;
  supportingMetrics:      Record<string, number>;
  safetyImpactSummary:    string;     // narrative of case impact assessment
  estimatedCasesAffected: number;     // how many past cases would have changed
  proposedBy:             string;
  proposedAt:             string;
  expiresAt:              string;     // 72-hour review window then EXPIRED
  status:                 "PENDING_PHYSICIAN_REVIEW" | "APPROVED" | "REJECTED" | "EXPIRED";
  approvingPhysicianId?:  string;
  approvedAt?:            string;
  approvalNotes?:         string;
  rejectionReason?:       string;
}

/**
 * Creates a policy proposal for physician review.
 * Returns error if drift circuit breaker is currently OPEN.
 * Proposals expire after 72 hours if not reviewed.
 * Never auto-promotes — always requires human approval.
 */
export declare function proposePolicy(params: {
  candidateMode:     PolicyMode;
  currentMode:       PolicyMode;
  supportingMetrics: Record<string, number>;
  proposedBy:        string;
}): Promise<PolicyProposal | { error: string }>;

/** Promotes the policy to the candidate mode. Writes POLICY_UPDATED audit step. */
export declare function approvePolicy(params: {
  proposalId:            string;
  approvingPhysicianId:  string;
  approvalNotes:         string;
}): Promise<{ success: boolean; error?: string; proposal?: PolicyProposal }>;

export declare function rejectPolicy(params: {
  proposalId:       string;
  physicianId:      string;
  rejectionReason:  string;
}): Promise<{ success: boolean; error?: string }>;

export declare function getPendingProposals(): PolicyProposal[];
export declare function getAllProposals(): PolicyProposal[];


// ─── 2.3 · Immutable Audit Trail Verification ────────────────────────────────

/**
 * Rec 2.2 — The existing hash chain writes are correct. This adds the
 * READ-SIDE verification required by 45 CFR §164.312(b). A write-only
 * hash chain without verification does not satisfy the rule.
 *
 * Amazon HealthLake uses S3 Object Lock (WORM) + nightly hash verification.
 * Epic uses dual-write audit + nightly hash verification jobs.
 * This system uses chain verification + Merkle batch verification.
 */
export interface ChainVerificationResult {
  verified:       boolean;
  recordsChecked: number;
  brokenAt?: {
    recordIndex:  number;
    traceId:      string;
    claimedHash:  string;
    expectedHash: string;
  };
  genesisHash:    string;     // always "GENESIS"
  latestHash:     string;     // SHA-256 of the most recent record
  verifiedAt:     string;
  durationMs:     number;
}

export interface MerkleVerificationResult {
  merkleRoot:  string;
  verified:    boolean;
  batchSize:   number;
  verifiedAt:  string;
}

/**
 * Reads ALL audit records in order and recomputes each hash from content.
 * If any record was tampered with, returns verified=false with the first
 * broken link identified. O(n) — use verifyAuditBatch for large logs.
 */
export declare function verifyFullAuditChain(): Promise<ChainVerificationResult>;

/**
 * Agent addition — Merkle root over the last N audit records.
 * Efficient spot-check without reading the full chain.
 * Default batch size: 100 records.
 */
export declare function verifyAuditBatch(limit?: number): Promise<MerkleVerificationResult>;

/**
 * Spot-check a single record — recomputes its hash from content fields
 * and compares to the stored hash using crypto.timingSafeEqual.
 */
export declare function verifyAuditRecord(record: {
  traceId: string; step: string; input: unknown; output: unknown;
  metadata: unknown; hash: string; prevHash: string;
}): boolean;


// ─── 2.4 · HIPAA Breach Risk Register (agent addition) ───────────────────────

/**
 * Live register of identified HIPAA breach exposure pathways.
 * Satisfies 45 CFR §164.308(a)(1) Risk Analysis requirement.
 * Surfaced at GET /api/compliance/breach-register.
 */
export type BreachRiskLevel   = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export type MitigationStatus  = "IMPLEMENTED" | "IN_PROGRESS" | "PLANNED" | "ACCEPTED";

export interface BreachRiskEntry {
  id:                  string;        // e.g. "BR-001"
  title:               string;
  hipaaSection:        string;        // e.g. "45 CFR §164.312(b)"
  fdaImpact:           string;
  triggerCondition:    string;        // narrative: what event triggers this breach
  riskLevel:           BreachRiskLevel;
  mitigationStatus:    MitigationStatus;
  mitigationNotes:     string;
  implementedControls: string[];      // which files implement the mitigation
  lastReviewedAt?:     string;
}

/**
 * Current register — 7 entries:
 *   BR-001  CRITICAL   Corrupted intake misclassification (Safety Veto blind spot)
 *   BR-002  CRITICAL   Missed testicular torsion / pediatric epiglottitis
 *   BR-003  CRITICAL   Immutable audit trail — missing verification
 *   BR-004  HIGH       Autonomous policy evolution — unapproved device modification
 *   BR-005  CRITICAL   ER_NOW delivery without physician pre-approval
 *   BR-006  HIGH       Google Sheets as clinical rule store (no HIPAA BAA)
 *   BR-007  HIGH       Demographic undertriage bias — ACA §1557
 *
 * Mitigation status: 6 IMPLEMENTED, 1 PLANNED (BR-006 Google Sheets)
 */
export declare function getBreachRiskRegister(): {
  register:    BreachRiskEntry[];
  summary:     { critical: number; high: number; medium: number; low: number; implemented: number; pending: number };
  lastUpdated: string;
};

export declare function updateMitigationStatus(
  id:      string,
  status:  MitigationStatus,
  notes?:  string
): boolean;


// ─── Existing Audit Logger (shown for context) ────────────────────────────────

/** Audit event types recorded in the audit log. */
export enum AuditEventType {
  CASE_INITIATED              = "CASE_INITIATED",
  SYMPTOM_EXTRACTED           = "SYMPTOM_EXTRACTED",
  RED_FLAG_DETECTED           = "RED_FLAG_DETECTED",
  AGENT_VERDICT_SUBMITTED     = "AGENT_VERDICT_SUBMITTED",
  CONSENSUS_REACHED           = "CONSENSUS_REACHED",
  PHYSICIAN_REVIEW_REQUESTED  = "PHYSICIAN_REVIEW_REQUESTED",
  PHYSICIAN_APPROVED          = "PHYSICIAN_APPROVED",
  PHYSICIAN_OVERRIDDEN        = "PHYSICIAN_OVERRIDDEN",
  DISPOSITION_DELIVERED       = "DISPOSITION_DELIVERED",
  OUTCOME_RECORDED            = "OUTCOME_RECORDED",
  POLICY_UPDATE_PROPOSED      = "POLICY_UPDATE_PROPOSED",
  POLICY_UPDATED              = "POLICY_UPDATED",
  POLICY_REJECTED             = "POLICY_REJECTED",
  DRIFT_DETECTED              = "DRIFT_DETECTED",
  PHYSICIAN_REVIEW_TIMEOUT    = "PHYSICIAN_REVIEW_TIMEOUT",
}

/** Existing auditStep signature — unchanged. */
export declare function auditStep(params: {
  traceId:   string;
  step:      string;
  input:     unknown;
  output:    unknown;
  metadata?: Record<string, unknown>;
}): Promise<void>;


// ─── API Endpoints Exposed ────────────────────────────────────────────────────
/*
  GET  /api/compliance/physician-checkpoint/config
  GET  /api/compliance/physician-checkpoint/pending
  POST /api/compliance/physician-checkpoint/request
  POST /api/compliance/physician-checkpoint/:id/decide
  GET  /api/compliance/physician-checkpoint/:id

  GET  /api/compliance/policy-proposals
  GET  /api/compliance/policy-proposals/pending
  POST /api/compliance/policy-proposals/propose
  POST /api/compliance/policy-proposals/:id/approve
  POST /api/compliance/policy-proposals/:id/reject

  GET   /api/compliance/breach-register
  PATCH /api/compliance/breach-register/:id/mitigation

  GET  /api/compliance/audit-verify
  GET  /api/compliance/audit-verify/batch?limit=100
*/

// Placeholder — DispositionTier is defined in domain1-safety-interfaces.ts
declare enum DispositionTier {
  ER_NOW = "ER_NOW", ER_URGENT = "ER_URGENT", URGENT_CARE = "URGENT_CARE",
  TELEHEALTH_NOW = "TELEHEALTH_NOW", NEXT_DAY = "NEXT_DAY",
  ROUTINE = "ROUTINE", SELF_CARE = "SELF_CARE",
}
