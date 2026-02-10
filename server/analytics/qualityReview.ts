import { z } from "zod";

export const QualityRatingSchema = z.enum(["great", "ok", "bad"]);
export type QualityRating = z.infer<typeof QualityRatingSchema>;

export const QualityReviewSchema = z.object({
  runId: z.string(),
  rating: QualityRatingSchema,
  reason: z.string().optional(),
  reviewedAt: z.string(),
  reviewedBy: z.string().optional(),
});

export type QualityReview = z.infer<typeof QualityReviewSchema>;

export const REVIEW_REASONS = [
  "too many questions",
  "missed key question",
  "tone annoyed patient",
  "premature escalation",
  "not empathic enough",
  "incorrect disposition",
  "excellent flow",
  "other",
] as const;

interface QualityReviewBackend {
  save(review: QualityReview): Promise<void>;
  getByRunId(runId: string): Promise<QualityReview | null>;
  list(limit?: number): Promise<QualityReview[]>;
  getSummary(): Promise<QualityReviewSummary>;
}

export interface QualityReviewSummary {
  total: number;
  great: number;
  ok: number;
  bad: number;
  topReasons: Array<{ reason: string; count: number }>;
  recentReviews: QualityReview[];
}

class InMemoryQualityReviewStore implements QualityReviewBackend {
  private reviews: QualityReview[] = [];

  async save(review: QualityReview) {
    const existing = this.reviews.findIndex(r => r.runId === review.runId);
    if (existing >= 0) {
      this.reviews[existing] = review;
    } else {
      this.reviews.unshift(review);
    }
    if (this.reviews.length > 500) this.reviews.length = 500;
  }

  async getByRunId(runId: string) {
    return this.reviews.find(r => r.runId === runId) ?? null;
  }

  async list(limit = 50) {
    return this.reviews.slice(0, limit);
  }

  async getSummary(): Promise<QualityReviewSummary> {
    const total = this.reviews.length;
    const great = this.reviews.filter(r => r.rating === "great").length;
    const ok = this.reviews.filter(r => r.rating === "ok").length;
    const bad = this.reviews.filter(r => r.rating === "bad").length;

    const reasonCounts = new Map<string, number>();
    for (const r of this.reviews) {
      if (r.reason) {
        reasonCounts.set(r.reason, (reasonCounts.get(r.reason) ?? 0) + 1);
      }
    }
    const topReasons = [...reasonCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([reason, count]) => ({ reason, count }));

    return {
      total,
      great,
      ok,
      bad,
      topReasons,
      recentReviews: this.reviews.slice(0, 10),
    };
  }
}

let store: QualityReviewBackend;

export function getQualityReviewStore(): QualityReviewBackend {
  if (!store) {
    store = new InMemoryQualityReviewStore();
    console.log("[QualityReview] Using in-memory backend");
  }
  return store;
}
