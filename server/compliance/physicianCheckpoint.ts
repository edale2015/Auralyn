/**
 * DOMAIN 2 — REC 2.1: Physician Approval Gate (P0 FDA Requirement)
 *
 * Mandatory physician pre-approval for ER_NOW, ER_URGENT, and URGENT_CARE
 * dispositions. This is the single most important control for maintaining
 * Class II SaMD status under FDA's 2021 AI/ML Action Plan.
 *
 * Without this gate, the system is operating as an autonomous diagnostic
 * device — Class III territory requiring PMA approval.
 *
 * MY ADDITION: Escalation-on-timeout logic. If physician doesn't respond
 * within reviewTimeoutMinutes, the disposition is automatically escalated
 * one tier (ER_URGENT → ER_NOW) and on-call physician is paged.
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

export const REVIEW_TIMEOUT_MINUTES = 10;

export interface PhysicianApprovalRecord {
  approvalId:          string;
  caseId:              string;
  traceId:             string;
  proposedDisposition: DispositionTier;
  modelVersion:        string;
  agentWeights:        Record<string, number>;
  confidenceScore:     number;
  redFlagsEvaluated:   string[];
  requestedAt:         string;
  timeoutAt:           string;
  status:              "PENDING" | "APPROVED" | "OVERRIDDEN" | "TIMED_OUT";
  physicianId?:        string;
  reviewedAt?:         string;
  decision?:           "approved" | "overridden";
  overrideDisposition?: DispositionTier;
  overrideReason?:     string;
  timeToReviewSeconds?: number;
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
  const approvalId = randomUUID();
  const traceId    = createTraceId();
  const requestedAt = new Date();
  const timeoutAt   = new Date(requestedAt.getTime() + REVIEW_TIMEOUT_MINUTES * 60_000);

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
    status:              "PENDING",
  };

  pendingApprovals.set(approvalId, record);

  await auditStep({
    traceId,
    step:     "PHYSICIAN_REVIEW_REQUESTED",
    input:    { caseId: params.caseId, disposition: params.disposition },
    output:   { approvalId, timeoutAt: record.timeoutAt },
    metadata: { modelVersion: params.modelVersion, confidence: params.confidenceScore },
  });

  emitEvent({
    type:      "PHYSICIAN_REVIEW_REQUIRED",
    payload:   { approvalId, caseId: params.caseId, disposition: params.disposition, timeoutAt: record.timeoutAt },
    timestamp: Date.now(),
  });

  logger.info("physician_approval_requested", {
    approvalId, caseId: params.caseId, disposition: params.disposition,
  });

  // MY ADDITION: Schedule timeout escalation
  const timeoutMs = REVIEW_TIMEOUT_MINUTES * 60_000;
  setTimeout(async () => {
    const pending = pendingApprovals.get(approvalId);
    if (pending && pending.status === "PENDING") {
      await handleApprovalTimeout(approvalId);
    }
  }, timeoutMs).unref();

  return record;
}

export async function recordPhysicianDecision(params: {
  approvalId:           string;
  physicianId:          string;
  decision:             "approved" | "overridden";
  overrideDisposition?: DispositionTier;
  overrideReason?:      string;
}): Promise<PhysicianApprovalRecord | null> {
  const record = pendingApprovals.get(params.approvalId);
  if (!record) return null;

  const reviewedAt = new Date();
  record.status             = params.decision === "approved" ? "APPROVED" : "OVERRIDDEN";
  record.physicianId        = params.physicianId;
  record.reviewedAt         = reviewedAt.toISOString();
  record.decision           = params.decision;
  record.overrideDisposition = params.overrideDisposition;
  record.overrideReason     = params.overrideReason;
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
    metadata: { timeoutMinutes: REVIEW_TIMEOUT_MINUTES },
  });

  emitEvent({
    type:      "ALERT",
    payload:   {
      message:  `Physician review timed out for case ${record.caseId}. Auto-escalated from ${record.proposedDisposition} to ${escalated}.`,
      severity: "HIGH",
      approvalId,
      escalatedTo: escalated,
    },
    timestamp: Date.now(),
  });

  logger.warn("physician_review_timeout", {
    approvalId, caseId: record.caseId,
    originalDisposition: record.proposedDisposition, escalatedTo: escalated,
  });
}

export function getPendingApprovals(): PhysicianApprovalRecord[] {
  return Array.from(pendingApprovals.values()).filter(r => r.status === "PENDING");
}

export function getApprovalRecord(approvalId: string): PhysicianApprovalRecord | undefined {
  return pendingApprovals.get(approvalId);
}
