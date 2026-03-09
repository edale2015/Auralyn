import admin from "firebase-admin";
import { randomUUID } from "crypto";

const COLLECTION = "gold_reviews";

function getDb() {
  return admin.firestore();
}

export interface GoldReview {
  reviewId: string;
  complaintId: string;
  caseId?: string;
  disposition: string;
  topDiagnosis: string;
  mustAskNext: string[];
  optionalAskNext: string[];
  enoughInfoNow: boolean;
  tests: string[];
  medsConsidered: string[];
  medsAvoid: string[];
  redFlags: string[];
  confidence: string;
  rationale: string;
  createdBy: string;
  createdAt: string;
}

export type CreateGoldReviewInput = Omit<GoldReview, "reviewId" | "createdAt">;

export class GoldReviewStore {
  private col() {
    return getDb().collection(COLLECTION);
  }

  async create(input: CreateGoldReviewInput): Promise<GoldReview> {
    const review: GoldReview = {
      ...input,
      reviewId: randomUUID(),
      createdAt: new Date().toISOString(),
    };
    await this.col().doc(review.reviewId).set(review);
    return review;
  }

  async get(reviewId: string): Promise<GoldReview | null> {
    const snap = await this.col().doc(reviewId).get();
    if (!snap.exists) return null;
    return snap.data() as GoldReview;
  }

  async list(complaintId?: string): Promise<GoldReview[]> {
    let query: FirebaseFirestore.Query = this.col().orderBy("createdAt", "desc");
    if (complaintId) {
      query = this.col()
        .where("complaintId", "==", complaintId)
        .orderBy("createdAt", "desc");
    }
    const snap = await query.get();
    return snap.docs.map((d) => d.data() as GoldReview);
  }

  async delete(reviewId: string): Promise<void> {
    await this.col().doc(reviewId).delete();
  }

  async countByComplaint(): Promise<Record<string, number>> {
    const snap = await this.col().get();
    const counts: Record<string, number> = {};
    for (const doc of snap.docs) {
      const data = doc.data() as GoldReview;
      counts[data.complaintId] = (counts[data.complaintId] || 0) + 1;
    }
    return counts;
  }
}

export const goldReviewStore = new GoldReviewStore();
