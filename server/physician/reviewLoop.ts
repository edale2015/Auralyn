import { logDecisionTrace } from "./auditEngine";

export interface ReviewableCase {
  caseId: string;
  patientId?: string;
  riskScore: number;
  triage?: string;
  agentDecision?: string;
  scores?: { centor?: number; curb65?: number };
  complaints?: string[];
}

export interface ReviewDecision {
  requiresReview: boolean;
  priority: "immediate" | "urgent" | "routine" | "none";
  reason: string;
}

const HIGH_RISK_THRESHOLD = 0.7;
const MODERATE_RISK_THRESHOLD = 0.4;
const CENTOR_REVIEW_THRESHOLD = 3;
const CURB65_REVIEW_THRESHOLD = 2;

export function requiresReview(caseData: ReviewableCase): ReviewDecision {
  if (caseData.riskScore > HIGH_RISK_THRESHOLD) {
    return {
      requiresReview: true,
      priority: "immediate",
      reason: `Risk score ${caseData.riskScore.toFixed(2)} exceeds threshold ${HIGH_RISK_THRESHOLD}`,
    };
  }

  if ((caseData.scores?.curb65 ?? 0) >= CURB65_REVIEW_THRESHOLD) {
    return {
      requiresReview: true,
      priority: "urgent",
      reason: `CURB-65 score ${caseData.scores!.curb65} indicates moderate-severe pneumonia`,
    };
  }

  if ((caseData.scores?.centor ?? 0) >= CENTOR_REVIEW_THRESHOLD) {
    return {
      requiresReview: true,
      priority: "routine",
      reason: `Centor score ${caseData.scores!.centor} suggests antibiotic consideration`,
    };
  }

  if (caseData.triage === "immediate") {
    return {
      requiresReview: true,
      priority: "immediate",
      reason: "Immediate triage level always requires physician review",
    };
  }

  if (caseData.riskScore > MODERATE_RISK_THRESHOLD) {
    return {
      requiresReview: true,
      priority: "routine",
      reason: `Moderate risk score ${caseData.riskScore.toFixed(2)}`,
    };
  }

  return { requiresReview: false, priority: "none", reason: "Within autonomous action threshold" };
}

export function processReviewDecision(caseData: ReviewableCase): ReviewDecision {
  const decision = requiresReview(caseData);

  logDecisionTrace({
    actor: "system",
    action: decision.requiresReview ? "review_required" : "autonomous_action_approved",
    entityType: "patient",
    entityId: caseData.caseId,
    after: { decision, riskScore: caseData.riskScore },
    approved: !decision.requiresReview,
    notes: decision.reason,
    riskScore: caseData.riskScore,
  });

  return decision;
}
