/**
 * RLHF Human-Gated Learning Queue
 *
 * All proposed model updates from autonomous learning loops (RLHF, outcome
 * tracking, physician feedback) must pass through this queue before they
 * can be applied to the production model.
 *
 * FDA SaMD requirement: "Human-in-the-loop" for learning system updates.
 * No weight updates or rule changes are deployed without explicit physician
 * or clinical admin review and approval.
 *
 * Architecture:
 *   1. Learning loop produces a LearningUpdate proposal
 *   2. submitLearningUpdate() → queued with status "PENDING"
 *   3. Physician/admin reviews via /api/advanced/review-queue/*
 *   4. approveUpdate() or rejectUpdate() → update applied or discarded
 *   5. All actions are cryptographically audit-logged
 */

import { logSecureEvent } from "../ops/secureAudit";

export type UpdateStatus = "PENDING" | "APPROVED" | "REJECTED" | "APPLIED" | "EXPIRED";
export type UpdateType =
  | "RULE_SUGGESTION"     // new or modified triage rule
  | "WEIGHT_ADJUSTMENT"   // scoring weight update
  | "DISPOSITION_CHANGE"  // disposition threshold change
  | "DRUG_INTERACTION"    // new drug interaction
  | "KNOWLEDGE_UPDATE"    // general knowledge graph update
  | "RLHF_REWARD"         // reward signal from physician feedback
  | "OUTCOME_LEARNING";   // case outcome-driven update

export interface LearningUpdate {
  id:          string;
  type:        UpdateType;
  submittedAt: string;
  expiresAt:   string;     // auto-expire pending updates after 30 days
  status:      UpdateStatus;
  source:      string;     // e.g., "outcome_learning_engine", "physician_feedback"
  description: string;
  proposal:    Record<string, unknown>;  // the actual change proposed
  priority:    "low" | "medium" | "high" | "critical";
  // Review fields
  reviewedBy?:  string;
  reviewedAt?:  string;
  reviewNote?:  string;
}

// In-memory store (would be persisted to DB in production)
const queue: LearningUpdate[] = [];

function generateId(): string {
  return `LRN-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

/**
 * Submit a proposed learning update for human review.
 * Returns the queued update with its assigned ID.
 */
export function submitLearningUpdate(proposal: {
  type:        UpdateType;
  source:      string;
  description: string;
  proposal:    Record<string, unknown>;
  priority?:   LearningUpdate["priority"];
}): LearningUpdate {
  const update: LearningUpdate = {
    id:          generateId(),
    type:        proposal.type,
    submittedAt: new Date().toISOString(),
    expiresAt:   new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
    status:      "PENDING",
    source:      proposal.source,
    description: proposal.description,
    proposal:    proposal.proposal,
    priority:    proposal.priority ?? "medium",
  };

  queue.push(update);

  logSecureEvent({
    type:    "LEARNING_CYCLE",
    actor:   proposal.source,
    payload: { action: "SUBMITTED", id: update.id, type: update.type, priority: update.priority },
  });

  console.log(`[ReviewQueue] Submitted ${update.type} update ${update.id} (priority: ${update.priority})`);
  return update;
}

/**
 * Approve a pending update. In production this would trigger the actual
 * model/rule update via the deployment pipeline.
 */
export function approveUpdate(id: string, options: { reviewer: string; note?: string }): LearningUpdate {
  const update = findById(id);
  update.status    = "APPROVED";
  update.reviewedBy = options.reviewer;
  update.reviewedAt = new Date().toISOString();
  update.reviewNote = options.note;

  logSecureEvent({
    type:    "ADMIN_ACTION",
    actor:   options.reviewer,
    payload: { action: "LEARNING_UPDATE_APPROVED", id, type: update.type, note: options.note },
  });

  console.log(`[ReviewQueue] APPROVED: ${id} by ${options.reviewer}`);
  return update;
}

/**
 * Reject a pending update with a mandatory reason.
 */
export function rejectUpdate(id: string, options: { reviewer: string; reason: string }): LearningUpdate {
  const update = findById(id);
  update.status    = "REJECTED";
  update.reviewedBy = options.reviewer;
  update.reviewedAt = new Date().toISOString();
  update.reviewNote = options.reason;

  logSecureEvent({
    type:    "ADMIN_ACTION",
    actor:   options.reviewer,
    payload: { action: "LEARNING_UPDATE_REJECTED", id, type: update.type, reason: options.reason },
  });

  console.log(`[ReviewQueue] REJECTED: ${id} by ${options.reviewer} — ${options.reason}`);
  return update;
}

export function listQueue(filter?: { status?: UpdateStatus; type?: UpdateType }): LearningUpdate[] {
  let results = queue.slice().sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  if (filter?.status) results = results.filter((u) => u.status === filter.status);
  if (filter?.type)   results = results.filter((u) => u.type === filter.type);
  return results;
}

export function getQueueStats() {
  return {
    total:    queue.length,
    pending:  queue.filter((u) => u.status === "PENDING").length,
    approved: queue.filter((u) => u.status === "APPROVED").length,
    rejected: queue.filter((u) => u.status === "REJECTED").length,
  };
}

function findById(id: string): LearningUpdate {
  const u = queue.find((x) => x.id === id);
  if (!u) throw new Error(`Learning update ${id} not found`);
  return u;
}
