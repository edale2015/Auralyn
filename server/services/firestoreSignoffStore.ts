import admin from "firebase-admin";
import type { SignoffRecord, SignoffStatus, PhysicianOverride } from "../types/signoff";
import type { EngineDisposition } from "../types/case";

const SIGNOFFS_COLLECTION = "signoffs";

function getDb() {
  return admin.firestore();
}

function nowIso(): string {
  return new Date().toISOString();
}

function buildSignoffId(caseId: string): string {
  return `signoff_${caseId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export interface CreateSignoffInput {
  caseId: string;
  reviewerId: string;
  reviewerName?: string;
  reviewerRole?: string;
  status: SignoffStatus;
  engineDisposition?: EngineDisposition;
  finalDisposition?: EngineDisposition;
  override?: PhysicianOverride;
  requestMoreInfoQuestions?: string[];
  rationale?: string;
  engineVersion?: string;
  rulesVersion?: string;
}

export class FirestoreSignoffStore {
  private db = getDb();
  private col = this.db.collection(SIGNOFFS_COLLECTION);

  async createSignoff(input: CreateSignoffInput): Promise<SignoffRecord> {
    const record: SignoffRecord = {
      signoffId: buildSignoffId(input.caseId),
      caseId: input.caseId,
      reviewerId: input.reviewerId,
      reviewerName: input.reviewerName,
      reviewerRole: input.reviewerRole,

      createdAt: nowIso(),
      updatedAt: nowIso(),

      status: input.status,
      engineDisposition: input.engineDisposition,
      finalDisposition: input.finalDisposition,
      override: input.override,
      requestMoreInfoQuestions: input.requestMoreInfoQuestions ?? [],
      rationale: input.rationale,
      engineVersion: input.engineVersion,
      rulesVersion: input.rulesVersion,
    };

    await this.col.doc(record.signoffId).set(record);
    return record;
  }

  async getSignoff(signoffId: string): Promise<SignoffRecord | null> {
    const snap = await this.col.doc(signoffId).get();
    if (!snap.exists) return null;
    return snap.data() as SignoffRecord;
  }

  async listSignoffsForCase(caseId: string): Promise<SignoffRecord[]> {
    const snap = await this.col
      .where("caseId", "==", caseId)
      .orderBy("createdAt", "asc")
      .get();

    return snap.docs.map((d) => d.data() as SignoffRecord);
  }
}

export const firestoreSignoffStore = new FirestoreSignoffStore();
