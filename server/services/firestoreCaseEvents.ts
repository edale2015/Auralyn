import admin from "firebase-admin";
import type { CaseEventRecord, CaseEventType } from "../types/case";

const EVENTS_COLLECTION = "case_events";

function getDb() {
  return admin.firestore();
}

function nowIso(): string {
  return new Date().toISOString();
}

function buildEventId(caseId: string): string {
  return `${caseId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export interface AppendCaseEventInput {
  caseId: string;
  type: CaseEventType;
  actorId?: string;
  actorRole?: string;
  summary: string;
  payload?: Record<string, unknown>;
}

export class FirestoreCaseEventsStore {
  private db = getDb();
  private col = this.db.collection(EVENTS_COLLECTION);

  async appendEvent(input: AppendCaseEventInput): Promise<CaseEventRecord> {
    const event: CaseEventRecord = {
      eventId: buildEventId(input.caseId),
      caseId: input.caseId,
      type: input.type,
      createdAt: nowIso(),
      actorId: input.actorId,
      actorRole: input.actorRole,
      summary: input.summary,
      payload: input.payload ?? {},
    };

    await this.col.doc(event.eventId).set(event);
    return event;
  }

  async listEventsForCase(caseId: string, limit = 500): Promise<CaseEventRecord[]> {
    const snap = await this.col
      .where("caseId", "==", caseId)
      .orderBy("createdAt", "asc")
      .limit(limit)
      .get();

    return snap.docs.map((d) => d.data() as CaseEventRecord);
  }
}

export const firestoreCaseEventsStore = new FirestoreCaseEventsStore();
