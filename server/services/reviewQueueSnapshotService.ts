import { firestoreCaseStore } from "./firestoreCaseStore";
import { buildChatCaseSnapshot, type CaseSnapshot } from "./chatCaseSnapshotBuilder";

export class ReviewQueueSnapshotService {
  async listQueueSnapshots(limit = 100): Promise<CaseSnapshot[]> {
    const cases = await firestoreCaseStore.listReviewQueue(limit);
    return cases.map((c) => buildChatCaseSnapshot(c));
  }
}

export const reviewQueueSnapshotService = new ReviewQueueSnapshotService();
