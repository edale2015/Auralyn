/**
 * server/services/rlhfService.ts — RLHF feedback and proposal management
 *
 * FIXES (Code Review Issues #3, #4):
 *   1. listFeedback/listProposals/generateProposals now accept optional clinicId
 *      for tenant-scoped filtering (Issue #3).
 *   2. reviewProposal() captures reviewer identity from the JWT (not caller body)
 *      and no longer accepts "applied" as a valid status (Issue #4).
 *   3. applyProposal() is a new admin-only method that transitions proposals to
 *      "applied" with full applier identity capture (Issue #4).
 */

import { randomUUID } from "crypto";
import type { RLHFFeedbackEvent, RLHFProposal } from "../types/clinical";

// ── Identity capture types ────────────────────────────────────────────────────

interface ReviewerInfo {
  reviewerId:   string;
  reviewerRole: string;
  clinicId?:    string;
  reviewedAt:   string;
}

interface ApplierInfo {
  appliedById:   string;
  appliedByRole: string;
  clinicId?:     string;
  appliedAt:     string;
}

// Extended internal types with identity + clinic fields
interface AuditedFeedback extends RLHFFeedbackEvent {
  clinicId?:    string;
  physicianId?: string;
}

interface AuditedProposal extends RLHFProposal {
  clinicId?:  string;
  reviewer?:  ReviewerInfo;
  applier?:   ApplierInfo;
}

// ── Service ───────────────────────────────────────────────────────────────────

class RLHFService {
  private readonly feedback:   AuditedFeedback[]  = [];
  private readonly proposals:  AuditedProposal[]  = [];
  private readonly minEvidence = 5;
  private readonly maxDeltaPct = 0.02;

  // ── Feedback ────────────────────────────────────────────────────────────────

  addFeedback(event: Omit<AuditedFeedback, "id" | "createdAt">): AuditedFeedback {
    const full: AuditedFeedback = {
      ...event,
      id:        randomUUID(),
      createdAt: new Date().toISOString(),
    };
    this.feedback.push(full);
    return full;
  }

  listFeedback(clinicId?: string): AuditedFeedback[] {
    if (!clinicId) return this.feedback;
    return this.feedback.filter(f => !f.clinicId || f.clinicId === clinicId);
  }

  // ── Proposals ───────────────────────────────────────────────────────────────

  generateProposals(clinicId?: string): AuditedProposal[] {
    const scopedFeedback = clinicId
      ? this.feedback.filter(f => !f.clinicId || f.clinicId === clinicId)
      : this.feedback;

    const grouped = new Map<string, AuditedFeedback[]>();
    for (const item of scopedFeedback) {
      const key = `${item.complaint}::${item.predictedDiagnosis ?? "unknown"}`;
      grouped.set(key, [...(grouped.get(key) ?? []), item]);
    }

    const created: AuditedProposal[] = [];

    for (const [key, items] of grouped.entries()) {
      if (items.length < this.minEvidence) continue;

      const incorrect    = items.filter((i) => !i.physicianAgreement).length;
      const safetyIssues = items.filter((i) => i.safetyIssue).length;
      if (incorrect === 0 && safetyIssues === 0) continue;

      const [complaint, predictedDiagnosis] = key.split("::");
      const direction     = incorrect / items.length > 0.25 || safetyIssues > 0 ? -1 : 1;
      const currentValue  = 1.0;
      const proposedValue = Math.max(0.5, Math.min(1.5, currentValue + direction * this.maxDeltaPct));

      const proposal: AuditedProposal = {
        id:            randomUUID(),
        complaint,
        targetType:    "diagnosis_weight",
        targetKey:     `${complaint}:${predictedDiagnosis}`,
        currentValue,
        proposedValue,
        reason:        `Generated from ${items.length} feedback events; incorrect=${incorrect}, safetyIssues=${safetyIssues}`,
        evidenceCount: items.length,
        requiresPhysicianReview: true,
        status:        "pending",
        createdAt:     new Date().toISOString(),
        clinicId,
      };

      this.proposals.push(proposal);
      created.push(proposal);
    }

    return created;
  }

  listProposals(clinicId?: string): AuditedProposal[] {
    if (!clinicId) return this.proposals;
    return this.proposals.filter(p => !p.clinicId || p.clinicId === clinicId);
  }

  /**
   * reviewProposal — physician approves or rejects a proposal.
   * FIXED (Issue #4): "applied" removed — use applyProposal() for that transition.
   * Reviewer identity captured from verified JWT, never from caller body.
   */
  reviewProposal(
    id:           string,
    status:       "approved" | "rejected",
    reviewerInfo: ReviewerInfo,
  ): AuditedProposal {
    const proposal = this.proposals.find((p) => p.id === id);
    if (!proposal) throw new Error(`RLHF proposal not found: ${id}`);

    if (proposal.status !== "pending") {
      throw new Error(
        `Proposal ${id} is in '${proposal.status}' state — only pending proposals can be reviewed`
      );
    }

    proposal.status   = status;
    proposal.reviewer = reviewerInfo;
    return proposal;
  }

  /**
   * applyProposal — admin-only: mark an approved proposal as applied.
   * FIXED (Issue #4): separate endpoint; only "approved" proposals can be applied;
   * applier identity captured from verified JWT.
   */
  applyProposal(id: string, applierInfo: ApplierInfo): AuditedProposal {
    const proposal = this.proposals.find((p) => p.id === id);
    if (!proposal) throw new Error(`RLHF proposal not found: ${id}`);

    if (proposal.status !== "approved") {
      throw new Error(
        `Proposal ${id} must be 'approved' before applying — current status: '${proposal.status}'`
      );
    }

    proposal.status  = "applied";
    proposal.applier = applierInfo;
    return proposal;
  }
}

export const rlhfService = new RLHFService();
