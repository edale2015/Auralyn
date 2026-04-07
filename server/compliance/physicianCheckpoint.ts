/**
 * DOMAIN 2 — REC 2.1: Physician Approval Gate (P0 FDA Requirement)
 *
 * Mandatory physician pre-approval for ER_NOW, ER_URGENT, and URGENT_CARE
 * dispositions. This is the single most important control for maintaining
 * Class II SaMD status under FDA's 2021 AI/ML Action Plan.
 *
 * CLAUDE REVIEW ADDITIONS (Round 2):
 *   - Tier-specific timeouts: ER_NOW=5min, ER_URGENT=10min, URGENT_CARE=20min
 *   - batchApproveUrgentCare() — physician can clear multiple URGENT_CARE cases at once
 *   - Reduced operational burden while maintaining full audit trail
 */

import { randomUUID }   from "crypto";
import { DispositionTier, escalateOneLevel } from "../safety/hardStopRules";
import { auditStep, createTraceId } from "../audit/auditLogger";
import { emitEvent }    from "../controlTower/eventBus";
import { logger }       from "../utils/logger";

export const DISPOSITIONS_REQUIRING_APPROVAL: DispositionTier[] = [
  DispositionTier.ER_NOW,
  DispositionTier.ER_URGENT,
  DispositionTier.URGENT_CARE,
];

/**
 * Claude rec: tier-specific timeouts.
 * ER_NOW: 5 min — fastest escalation, immediate life threat
 * ER_URGENT: 10 min — high urgency, hour-window
 * URGENT_CARE: 20 min — defensible per clinical literature
 */
export const TIER_SPECIFIC_TIMEOUTS: Record<string, number> = {
  [DispositionTier.ER_NOW]:      5,
  [DispositionTier.ER_URGENT]:   10,
  [DispositionTier.URGENT_CARE]: 20,
};

/** Legacy constant kept for backward-compat — use TIER_SPECIFIC_TIMEOUTS per disposition */
export const REVIEW_TIMEOUT_MINUTES = 10;

export interface PhysicianApprovalRecord {
  approvalId:           string;
  caseId:               string;
  traceId:              string;
  proposedDisposition:  DispositionTier;
  modelVersion:         string;
  agentWeights:         Record<string, number>;
  confidenceScore:      number;
  redFlagsEvaluated:    string[];
  requestedAt:          string;
  timeoutAt:            string;
  timeoutMinutes:       number;    // which tier-specific timeout was applied
  status:               "PENDING" | "APPROVED" | "OVERRIDDEN" | "TIMED_OUT";
  physicianId?:         string;
  reviewedAt?:          string;
  decision?:            "approved" | "overridden";
  overrideDisposition?: DispositionTier;
  overrideReason?:      string;
  timeToReviewSeconds?: number;
  batchApprovalId?:     string;    // set when part of a batch approval
}

const pendingApprovals = new Map<string, PhysicianApprovalRecord>();

export function requiresPhysicianApproval(disposition: string): boolean {
  return DISPOSITIONS_REQUIRING_APPROVAL.includes(disposition as DispositionTier);
}

export async function createPhysicianApprovalRequest(params: {
  caseId:              string;
  disposition:         DispositionTier;
  modelVersion:        string;
  agentWeights:        Record<string, number>;
  confidenceScore:     number;
  redFlagsEvaluated:   string[];
}): Promise<PhysicianApprovalRecord> {
  const approvalId    = randomUUID();
  const traceId       = createTraceId();
  const requestedAt   = new Date();
  const timeoutMinutes = TIER_SPECIFIC_TIMEOUTS[params.disposition] ?? REVIEW_TIMEOUT_MINUTES;
  const timeoutAt     = new Date(requestedAt.getTime() + timeoutMinutes * 60_000);

  const record: PhysicianApprovalRecord = {
    approvalId,
    caseId:              params.caseId,
    traceId,
    proposedDisposition: params.disposition,
    modelVersion:        params.modelVersion,
    agentWeights:        params.agentWeights,
    confidenceScore:     params.confidenceScore,
    redFlagsEvaluated:   params.redFlagsEvaluated,
    requestedAt:         requestedAt.toISOString(),
    timeoutAt:           timeoutAt.toISOString(),
    timeoutMinutes,
    status:              "PENDING",
  };

  pendingApprovals.set(approvalId, record);

  await auditStep({
    traceId,
    step:     "PHYSICIAN_REVIEW_REQUESTED",
    input:    { caseId: params.caseId, disposition: params.disposition },
    output:   { approvalId, timeoutAt: record.timeoutAt, timeoutMinutes },
    metadata: { modelVersion: params.modelVersion, confidence: params.confidenceScore },
  });

  emitEvent({
    type:      "PHYSICIAN_REVIEW_REQUIRED",
    payload:   { approvalId, caseId: params.caseId, disposition: params.disposition, timeoutAt: record.timeoutAt, timeoutMinutes },
    timestamp: Date.now(),
  });

  logger.info("physician_approval_requested", {
    approvalId, caseId: params.caseId, disposition: params.disposition, timeoutMinutes,
  });

  setTimeout(async () => {
    const pending = pendingApprovals.get(approvalId);
    if (pending && pending.status === "PENDING") {
      await handleApprovalTimeout(approvalId);
    }
  }, timeoutMinutes * 60_000).unref();

  return record;
}

export async function recordPhysicianDecision(params: {
  approvalId:            string;
  physicianId:           string;
  decision:              "approved" | "overridden";
  overrideDisposition?:  DispositionTier;
  overrideReason?:       string;
}): Promise<PhysicianApprovalRecord | null> {
  const record = pendingApprovals.get(params.approvalId);
  if (!record) return null;

  const reviewedAt = new Date();
  record.status              = params.decision === "approved" ? "APPROVED" : "OVERRIDDEN";
  record.physicianId         = params.physicianId;
  record.reviewedAt          = reviewedAt.toISOString();
  record.decision            = params.decision;
  record.overrideDisposition = params.overrideDisposition;
  record.overrideReason      = params.overrideReason;
  record.timeToReviewSeconds = Math.round(
    (reviewedAt.getTime() - new Date(record.requestedAt).getTime()) / 1000
  );

  await auditStep({
    traceId:  record.traceId,
    step:     params.decision === "approved" ? "PHYSICIAN_APPROVED" : "PHYSICIAN_OVERRIDDEN",
    input:    { approvalId: params.approvalId, physicianId: params.physicianId },
    output:   { decision: params.decision, finalDisposition: params.overrideDisposition ?? record.proposedDisposition },
    metadata: { timeToReviewSeconds: record.timeToReviewSeconds },
  });

  logger.info("physician_decision_recorded", {
    approvalId: params.approvalId, decision: params.decision,
    timeToReviewSeconds: record.timeToReviewSeconds,
  });

  return record;
}

/**
 * Claude rec: Batch approval for URGENT_CARE cases.
 * Allows a physician to approve multiple URGENT_CARE cases in one action,
 * reducing operational burden while maintaining per-record audit trail.
 * Only works on URGENT_CARE — ER_NOW and ER_URGENT require individual review.
 */
export async function batchApproveUrgentCare(params: {
  approvalIds:         string[];
  physicianId:         string;
  batchApprovalReason: string;
}): Promise<{ approved: PhysicianApprovalRecord[]; skipped: string[] }> {
  const batchId = randomUUID();
  const approved: PhysicianApprovalRecord[] = [];
  const skipped:  string[] = [];

  for (const approvalId of params.approvalIds) {
    const record = pendingApprovals.get(approvalId);
    if (!record || record.status !== "PENDING") {
      skipped.push(approvalId);
      continue;
    }
    if (record.proposedDisposition !== DispositionTier.URGENT_CARE) {
      skipped.push(approvalId);
      continue;
    }

    const reviewedAt = new Date();
    record.status              = "APPROVED";
    record.physicianId         = params.physicianId;
    record.reviewedAt          = reviewedAt.toISOString();
    record.decision            = "approved";
    record.overrideReason      = params.batchApprovalReason;
    record.batchApprovalId     = batchId;
    record.timeToReviewSeconds = Math.round(
      (reviewedAt.getTime() - new Date(record.requestedAt).getTime()) / 1000
    );

    await auditStep({
      traceId:  record.traceId,
      step:     "PHYSICIAN_APPROVED",
      input:    { approvalId, physicianId: params.physicianId, batchId },
      output:   { decision: "approved", batchApproval: true, batchApprovalReason: params.batchApprovalReason },
      metadata: { timeToReviewSeconds: record.timeToReviewSeconds },
    });

    approved.push(record);
  }

  logger.info("batch_urgent_care_approval", {
    batchId, approvedCount: approved.length, skippedCount: skipped.length,
    physicianId: params.physicianId,
  });

  return { approved, skipped };
}

async function handleApprovalTimeout(approvalId: string): Promise<void> {
  const record = pendingApprovals.get(approvalId);
  if (!record) return;

  record.status = "TIMED_OUT";
  const escalated = escalateOneLevel(record.proposedDisposition);

  await auditStep({
    traceId:  record.traceId,
    step:     "PHYSICIAN_REVIEW_TIMEOUT",
    input:    { approvalId, originalDisposition: record.proposedDisposition },
    output:   { escalatedTo: escalated, action: "auto_escalated" },
    metadata: { timeoutMinutes: record.timeoutMinutes },
  });

  emitEvent({
    type: "ALERT",
    payload: {
      message:  `Physician review timed out for case ${record.caseId} (${record.timeoutMinutes}min). Auto-escalated from ${record.proposedDisposition} to ${escalated}.`,
      severity: "HIGH",
      approvalId, escalatedTo: escalated,
    },
    timestamp: Date.now(),
  });

  logger.warn("physician_review_timeout", {
    approvalId, caseId: record.caseId,
    originalDisposition: record.proposedDisposition, escalatedTo: escalated,
    timeoutMinutes: record.timeoutMinutes,
  });
}

/**
 * Resolves expired physician-review checkpoints.
 *
 * POLICY — fail-closed:
 *   - NEVER auto-approve a timed-out review.  An expired review means the
 *     physician did not affirm the proposed disposition in time.
 *   - Expired reviews are ESCALATED one level up (ER_NOW → higher alert,
 *     URGENT_CARE → ER_URGENT, etc.) and the record is marked TIMED_OUT.
 *   - The escalation decision is written to the audit trail so FDA auditors
 *     can see exactly what happened and why.
 *
 * Call this on a short polling interval (e.g. every 30 s) so that expired
 * reviews are caught quickly rather than silently lingering as PENDING.
 *
 * Returns the list of approval IDs that were escalated.
 */
export async function resolveCheckpointTimeout(): Promise<string[]> {
  const now       = new Date();
  const escalated: string[] = [];

  for (const [approvalId, record] of pendingApprovals.entries()) {
    if (record.status !== "PENDING") continue;

    const timedOut = new Date(record.timeoutAt) <= now;
    if (!timedOut) continue;

    // Mark TIMED_OUT before any async work — prevents double-processing
    // if the function is called concurrently.
    record.status = "TIMED_OUT";

    let escalatedTo: string;
    try {
      escalatedTo = escalateOneLevel(record.proposedDisposition);
    } catch {
      // escalateOneLevel throws when already at the highest tier.
      // Keep the existing disposition and flag as critical.
      escalatedTo = record.proposedDisposition;
    }

    // Fail-closed audit record — must succeed even if downstream steps fail
    await auditStep({
      traceId:  record.traceId,
      step:     "PHYSICIAN_CHECKPOINT_TIMEOUT_ESCALATED",
      input:    { approvalId, originalDisposition: record.proposedDisposition, timeoutAt: record.timeoutAt },
      output:   { escalatedTo, action: "escalated_fail_closed", autoApproved: false },
      metadata: {
        caseId:        record.caseId,
        timeoutMinutes: record.timeoutMinutes,
        modelVersion:  record.modelVersion,
      },
    }).catch((err) =>
      logger.error("audit_write_failed_on_checkpoint_timeout", { approvalId, err })
    );

    emitEvent({
      type: "ALERT",
      payload: {
        message:  `CHECKPOINT TIMEOUT — case ${record.caseId} was NOT auto-approved. ` +
                  `Escalated from ${record.proposedDisposition} to ${escalatedTo}. ` +
                  `Physician review required immediately.`,
        severity:  "CRITICAL",
        approvalId,
        escalatedTo,
        autoApproved: false,
      },
      timestamp: Date.now(),
    });

    logger.error("physician_checkpoint_timeout_escalated", {
      approvalId,
      caseId:              record.caseId,
      originalDisposition: record.proposedDisposition,
      escalatedTo,
      timeoutMinutes:      record.timeoutMinutes,
      autoApproved:        false,
    });

    escalated.push(approvalId);
  }

  return escalated;
}

export function getPendingApprovals(): PhysicianApprovalRecord[] {
  return Array.from(pendingApprovals.values()).filter(r => r.status === "PENDING");
}

export function getApprovalRecord(approvalId: string): PhysicianApprovalRecord | undefined {
  return pendingApprovals.get(approvalId);
}

export function getAllApprovals(): PhysicianApprovalRecord[] {
  return Array.from(pendingApprovals.values());
}
