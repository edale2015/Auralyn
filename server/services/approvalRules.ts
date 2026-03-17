export interface ApprovalInput {
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  confidence: number;
  hasSafetyAlerts: boolean;
  disposition: string;
  complaintCategory?: string;
}

export interface ApprovalResult {
  action: "auto_approve" | "eligible_for_batch" | "mandatory_review" | "escalate";
  reason: string;
  requiresPhysician: boolean;
  urgency: "low" | "normal" | "high" | "critical";
}

export function evaluateApprovalRule(input: ApprovalInput): ApprovalResult {
  if (input.riskLevel === "HIGH") {
    return { action: "escalate", reason: "High-risk cases require immediate physician review", requiresPhysician: true, urgency: "critical" };
  }
  if (input.disposition === "er" || input.disposition === "er_now" || input.disposition === "urgent_now") {
    return { action: "escalate", reason: "High-severity disposition requires physician review", requiresPhysician: true, urgency: "critical" };
  }
  if (input.hasSafetyAlerts) {
    return { action: "mandatory_review", reason: "Safety alerts present — requires physician review", requiresPhysician: true, urgency: "high" };
  }
  if (input.confidence < 0.6) {
    return { action: "mandatory_review", reason: `Low confidence (${(input.confidence * 100).toFixed(0)}%) — requires physician review`, requiresPhysician: true, urgency: "high" };
  }
  if (input.confidence < 0.75) {
    return { action: "eligible_for_batch", reason: "Moderate confidence — eligible for batch approval", requiresPhysician: true, urgency: "normal" };
  }
  if (input.riskLevel === "MEDIUM") {
    return { action: "eligible_for_batch", reason: "Medium risk — eligible for batch review", requiresPhysician: true, urgency: "normal" };
  }
  return { action: "auto_approve", reason: "Low-risk, high-confidence, no safety alerts", requiresPhysician: false, urgency: "low" };
}

export function evaluateBatch(inputs: ApprovalInput[]): { results: (ApprovalInput & { approval: ApprovalResult })[]; summary: Record<string, number> } {
  const results = inputs.map((i) => ({ ...i, approval: evaluateApprovalRule(i) }));
  const summary: Record<string, number> = { auto_approve: 0, eligible_for_batch: 0, mandatory_review: 0, escalate: 0 };
  results.forEach((r) => { summary[r.approval.action]++; });
  return { results, summary };
}
