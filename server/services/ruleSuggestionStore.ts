import admin from "firebase-admin";

const COLLECTION = "rule_suggestions";

function getDb() {
  return admin.firestore();
}

function nowIso(): string {
  return new Date().toISOString();
}

function buildSuggestionId(): string {
  return `rs_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export type SuggestionType =
  | "promote_question"
  | "add_red_flag"
  | "strengthen_threshold"
  | "increase_dx_support"
  | "add_trigger";

export type SuggestionStatus = "pending" | "accepted" | "rejected" | "postponed";

export interface RuleSuggestion {
  suggestionId: string;
  complaintId: string;
  type: SuggestionType;
  description: string;
  rationale: string;
  status: SuggestionStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRuleSuggestionInput {
  complaintId: string;
  type: SuggestionType;
  description: string;
  rationale: string;
}

export class RuleSuggestionStore {
  private db = getDb();
  private col = this.db.collection(COLLECTION);

  async create(input: CreateRuleSuggestionInput): Promise<RuleSuggestion> {
    const now = nowIso();
    const record: RuleSuggestion = {
      suggestionId: buildSuggestionId(),
      complaintId: input.complaintId,
      type: input.type,
      description: input.description,
      rationale: input.rationale,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    };
    await this.col.doc(record.suggestionId).set(record);
    return record;
  }

  async list(complaintId?: string): Promise<RuleSuggestion[]> {
    let query: FirebaseFirestore.Query = this.col;
    if (complaintId) {
      query = query.where("complaintId", "==", complaintId);
    }
    query = query.orderBy("createdAt", "desc");
    const snap = await query.get();
    return snap.docs.map((d) => d.data() as RuleSuggestion);
  }

  async get(suggestionId: string): Promise<RuleSuggestion | null> {
    const snap = await this.col.doc(suggestionId).get();
    if (!snap.exists) return null;
    return snap.data() as RuleSuggestion;
  }

  async updateStatus(suggestionId: string, status: SuggestionStatus): Promise<RuleSuggestion | null> {
    const existing = await this.get(suggestionId);
    if (!existing) return null;
    const patch = { status, updatedAt: nowIso() };
    await this.col.doc(suggestionId).update(patch);
    return { ...existing, ...patch };
  }
}

export const ruleSuggestionStore = new RuleSuggestionStore();
