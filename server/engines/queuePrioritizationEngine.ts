import { StructuredIntakeCase } from "../services/intakeCaseStore";

export function computeQueuePriority(input: Partial<StructuredIntakeCase>): number {
  let score = 0;
  score += (input.riskScore || 0) * 5;
  if (input.reviewReason === "red_flags_detected") score += 500;
  if (input.reviewReason === "medication_review_required") score += 150;
  if (input.reviewReason === "unsupported_complaint_pathway") score += 120;
  const age = input.age || 0;
  if (age < 3 || age > 75) score += 40;
  if (input.proposedDisposition === "er_now") score += 1000;
  if (input.proposedDisposition === "urgent_care") score += 300;
  if (input.proposedDisposition === "telemed_now") score += 100;
  return score;
}

export function sortQueue<T extends { queuePriority?: number }>(cases: T[]): T[] {
  return [...cases].sort((a, b) => (b.queuePriority || 0) - (a.queuePriority || 0));
}
