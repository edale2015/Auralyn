import { logSecureEvent } from "../../ops/secureAudit";

export type ReviewStatus = "PENDING" | "ACCEPTED" | "OVERRIDDEN" | "ESCALATED";

export interface PhysicianReviewRecord {
  reviewId: string;
  encounterId: string;
  patientAge?: number;
  patientSex?: string;
  aiDiagnosis: string;
  aiDisposition: string;
  aiConfidence: number;
  physicianDiagnosis: string;
  physicianDisposition: string;
  override: boolean;
  overrideReason?: string;
  clinicalJustification?: string;
  reviewedBy: string;
  reviewedAt: string;
  status: ReviewStatus;
}

const reviewStore: PhysicianReviewRecord[] = [];

export function createReview(record: {
  encounterId: string;
  patientAge?: number;
  patientSex?: string;
  aiDiagnosis: string;
  aiDisposition: string;
  aiConfidence: number;
  physicianDiagnosis: string;
  physicianDisposition: string;
  overrideReason?: string;
  clinicalJustification?: string;
  reviewedBy: string;
}): PhysicianReviewRecord {
  const override =
    record.aiDiagnosis !== record.physicianDiagnosis ||
    record.aiDisposition !== record.physicianDisposition;

  const status: ReviewStatus = override ? "OVERRIDDEN" : "ACCEPTED";

  const review: PhysicianReviewRecord = {
    reviewId: `REV-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
    encounterId: record.encounterId,
    patientAge: record.patientAge,
    patientSex: record.patientSex,
    aiDiagnosis: record.aiDiagnosis,
    aiDisposition: record.aiDisposition,
    aiConfidence: record.aiConfidence,
    physicianDiagnosis: record.physicianDiagnosis,
    physicianDisposition: record.physicianDisposition,
    override,
    overrideReason: record.overrideReason,
    clinicalJustification: record.clinicalJustification,
    reviewedBy: record.reviewedBy,
    reviewedAt: new Date().toISOString(),
    status,
  };

  reviewStore.push(review);

  logSecureEvent({
    type: "PHYSICIAN_REVIEW",
    reviewId: review.reviewId,
    encounterId: review.encounterId,
    override,
    status,
    reviewedBy: review.reviewedBy,
  });

  return review;
}

export function getReviews(filter?: { overrideOnly?: boolean; reviewedBy?: string }): PhysicianReviewRecord[] {
  let results = [...reviewStore];
  if (filter?.overrideOnly) results = results.filter((r) => r.override);
  if (filter?.reviewedBy) results = results.filter((r) => r.reviewedBy === filter.reviewedBy);
  return results.slice(-100);
}

export function getReviewStats() {
  const total = reviewStore.length;
  const overrides = reviewStore.filter((r) => r.override).length;
  const overrideRate = total > 0 ? +(overrides / total).toFixed(3) : 0;
  return { total, overrides, overrideRate, active: true };
}

export function getDemoReview(): PhysicianReviewRecord {
  return createReview({
    encounterId: "ENC-DEMO-001",
    patientAge: 67,
    patientSex: "F",
    aiDiagnosis: "community_acquired_pneumonia",
    aiDisposition: "URGENT_24H",
    aiConfidence: 0.72,
    physicianDiagnosis: "aspiration_pneumonia",
    physicianDisposition: "ER_NOW",
    overrideReason: "bilateral_infiltrates_on_xray",
    clinicalJustification: "Chest X-ray showed bilateral infiltrates with fever 39.4°C; aspiration history present",
    reviewedBy: "Dr. Patel",
  });
}
