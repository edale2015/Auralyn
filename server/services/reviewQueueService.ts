import { firestoreCaseStore } from "./firestoreCaseStore";
import { firestoreCaseEventsStore } from "./firestoreCaseEvents";
import type { CaseRecord } from "../types/case";

export class ReviewQueueService {

  async listQueue(limit = 100): Promise<CaseRecord[]> {
    return firestoreCaseStore.listReviewQueue(limit);
  }

  async assignReviewer(caseId: string, reviewerId: string) {
    await firestoreCaseStore.assignReviewer(caseId, reviewerId);

    await firestoreCaseEventsStore.appendEvent({
      caseId,
      type: "ASSIGNED_REVIEWER",
      actorId: reviewerId,
      actorRole: "physician",
      summary: `Reviewer assigned`
    });
  }

  async requestMoreInfo(caseId: string, reviewerId: string, questions: string[]) {
    await firestoreCaseStore.markNeedsMoreInfo(caseId, questions);

    await firestoreCaseEventsStore.appendEvent({
      caseId,
      type: "REVIEW_REQUESTED_MORE_INFO",
      actorId: reviewerId,
      actorRole: "physician",
      summary: `Reviewer requested additional info`,
      payload: { questions }
    });
  }
}

export const reviewQueueService = new ReviewQueueService();
