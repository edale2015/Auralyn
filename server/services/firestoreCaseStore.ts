import admin from "firebase-admin";
import type {
  CaseRecord,
  CaseStatus,
  ReviewStatus,
  SourceChannel,
  CaseEngineResult,
} from "../types/case";

const CASES_COLLECTION = "cases";

function getDb() {
  return admin.firestore();
}

function nowIso(): string {
  return new Date().toISOString();
}

export interface CreateCaseInput {
  caseId: string;
  complaintId: string;
  complaintLabel?: string;
  sourceChannel?: SourceChannel;
  patientContext?: CaseRecord["patientContext"];
  answers?: Record<string, unknown>;
  conversationId?: string;
  externalThreadId?: string;
  sessionId?: string;
  signoffRequired?: boolean;
  metadata?: Record<string, unknown>;
}

export interface ListCasesOptions {
  status?: CaseStatus;
  reviewStatus?: ReviewStatus;
  assignedReviewerId?: string;
  complaintId?: string;
  limit?: number;
}

export class FirestoreCaseStore {
  private db = getDb();
  private col = this.db.collection(CASES_COLLECTION);

  async createCase(input: CreateCaseInput): Promise<CaseRecord> {
    const existing = await this.getCase(input.caseId);
    if (existing) return existing;

    const record: CaseRecord = {
      caseId: input.caseId,
      createdAt: nowIso(),
      updatedAt: nowIso(),

      status: "INTAKE_IN_PROGRESS",
      reviewStatus: "NOT_REVIEWED",

      sourceChannel: input.sourceChannel ?? "unknown",
      patientContext: input.patientContext ?? null,

      complaintId: input.complaintId,
      complaintLabel: input.complaintLabel ?? null,

      conversationId: input.conversationId ?? null,
      externalThreadId: input.externalThreadId ?? null,
      sessionId: input.sessionId ?? null,

      answers: input.answers ?? {},
      unansweredCriticalQuestions: [],

      signoffRequired: input.signoffRequired ?? true,
      exportedToEcw: false,

      metadata: input.metadata ?? {},
    };

    await this.col.doc(record.caseId).set(record);
    return record;
  }

  async getCase(caseId: string): Promise<CaseRecord | null> {
    const snap = await this.col.doc(caseId).get();
    if (!snap.exists) return null;
    return snap.data() as CaseRecord;
  }

  async upsertCase(record: CaseRecord): Promise<void> {
    await this.col.doc(record.caseId).set(
      {
        ...record,
        updatedAt: nowIso(),
      },
      { merge: true }
    );
  }

  async patchCase(caseId: string, patch: Partial<CaseRecord>): Promise<void> {
    await this.col.doc(caseId).set(
      {
        ...patch,
        updatedAt: nowIso(),
      },
      { merge: true }
    );
  }

  async updateAnswers(caseId: string, answersPatch: Record<string, unknown>): Promise<void> {
    const existing = await this.getCase(caseId);
    if (!existing) throw new Error(`Case not found: ${caseId}`);

    await this.patchCase(caseId, {
      answers: {
        ...(existing.answers ?? {}),
        ...answersPatch,
      },
    });
  }

  async setEngineResult(caseId: string, engineResult: CaseEngineResult): Promise<void> {
    await this.patchCase(caseId, {
      engineResult,
      noteDraft: engineResult.noteDraft,
      reviewStatus: "PENDING_REVIEW",
      status: "AWAITING_REVIEW",
    });
  }

  async assignReviewer(caseId: string, reviewerId: string): Promise<void> {
    await this.patchCase(caseId, {
      assignedReviewerId: reviewerId,
      reviewStatus: "REVIEWING",
      status: "IN_REVIEW",
    });
  }

  async markNeedsMoreInfo(caseId: string, questions: string[]): Promise<void> {
    await this.patchCase(caseId, {
      unansweredCriticalQuestions: questions,
      reviewStatus: "PENDING_REVIEW",
      status: "NEEDS_MORE_INFO",
    });
  }

  async markSignedOff(caseId: string, signoffId: string): Promise<void> {
    await this.patchCase(caseId, {
      signoffId,
      reviewStatus: "APPROVED",
      status: "SIGNED_OFF",
    });
  }

  async markOverridden(caseId: string, signoffId: string): Promise<void> {
    await this.patchCase(caseId, {
      signoffId,
      reviewStatus: "OVERRIDDEN",
      status: "SIGNED_OFF",
    });
  }

  async markExportedToEcw(caseId: string): Promise<void> {
    await this.patchCase(caseId, {
      exportedToEcw: true,
    });
  }

  async closeCase(caseId: string): Promise<void> {
    await this.patchCase(caseId, {
      status: "CLOSED",
    });
  }

  async listCases(options: ListCasesOptions = {}): Promise<CaseRecord[]> {
    let query: FirebaseFirestore.Query = this.col;

    if (options.status) query = query.where("status", "==", options.status);
    if (options.reviewStatus) query = query.where("reviewStatus", "==", options.reviewStatus);
    if (options.assignedReviewerId) query = query.where("assignedReviewerId", "==", options.assignedReviewerId);
    if (options.complaintId) query = query.where("complaintId", "==", options.complaintId);

    query = query.orderBy("updatedAt", "desc");

    if (options.limit) query = query.limit(options.limit);

    const snap = await query.get();
    return snap.docs.map((d) => d.data() as CaseRecord);
  }

  async listReviewQueue(limit = 100): Promise<CaseRecord[]> {
    const snap = await this.col
      .where("status", "in", ["AWAITING_REVIEW", "IN_REVIEW", "NEEDS_MORE_INFO"])
      .orderBy("updatedAt", "desc")
      .limit(limit)
      .get();

    return snap.docs.map((d) => d.data() as CaseRecord);
  }
}

export const firestoreCaseStore = new FirestoreCaseStore();
