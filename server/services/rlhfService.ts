import { randomUUID } from "crypto";
import type { RLHFFeedbackEvent, RLHFProposal } from "../types/clinical";

class RLHFService {
  private readonly feedback:  RLHFFeedbackEvent[] = [];
  private readonly proposals: RLHFProposal[]      = [];
  private readonly minEvidence = 5;
  private readonly maxDeltaPct = 0.02;

  addFeedback(event: Omit<RLHFFeedbackEvent, "id" | "createdAt">): RLHFFeedbackEvent {
    const full: RLHFFeedbackEvent = {
      ...event,
      id:        randomUUID(),
      createdAt: new Date().toISOString(),
    };
    this.feedback.push(full);
    return full;
  }

  listFeedback(): RLHFFeedbackEvent[] {
    return this.feedback;
  }

  generateProposals(): RLHFProposal[] {
    const grouped = new Map<string, RLHFFeedbackEvent[]>();

    for (const item of this.feedback) {
      const key = `${item.complaint}::${item.predictedDiagnosis ?? "unknown"}`;
      grouped.set(key, [...(grouped.get(key) ?? []), item]);
    }

    const created: RLHFProposal[] = [];

    for (const [key, items] of grouped.entries()) {
      if (items.length < this.minEvidence) continue;

      const incorrect    = items.filter((i) => !i.physicianAgreement).length;
      const safetyIssues = items.filter((i) => i.safetyIssue).length;
      if (incorrect === 0 && safetyIssues === 0) continue;

      const [complaint, predictedDiagnosis] = key.split("::");
      const direction    = incorrect / items.length > 0.25 || safetyIssues > 0 ? -1 : 1;
      const currentValue = 1.0;
      const proposedValue = Math.max(
        0.5,
        Math.min(1.5, currentValue + direction * this.maxDeltaPct)
      );

      const proposal: RLHFProposal = {
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
      };

      this.proposals.push(proposal);
      created.push(proposal);
    }

    return created;
  }

  listProposals(): RLHFProposal[] {
    return this.proposals;
  }

  reviewProposal(id: string, status: "approved" | "rejected" | "applied"): RLHFProposal {
    const proposal = this.proposals.find((p) => p.id === id);
    if (!proposal) throw new Error(`RLHF proposal not found: ${id}`);
    proposal.status = status;
    return proposal;
  }
}

export const rlhfService = new RLHFService();
