import { getFirestore } from "../firebase";
import admin from "firebase-admin";
import {
  CaseDoc,
  CaseMessage,
  CaseStatus,
  PhysicianReview,
} from "../models/caseTypes";
import { sha256Hex } from "./hash";

function cases() {
  return getFirestore().collection("cases");
}

function nowIso() {
  return new Date().toISOString();
}

function defaultReview(): PhysicianReview {
  return {
    status: "NONE",
    reviewedAt: null,
    reviewer: null,
    notes: "",
    finalDisposition: null,
    finalDx: null,
  };
}

export async function createCase(params: {
  channel: CaseDoc["source"]["channel"];
  threadId?: string;
  userId?: string;
  complaintSlug: string;
  complaintDisplay: string;
  engine: CaseDoc["complaint"]["engine"];
}): Promise<CaseDoc> {
  const caseId = `CASE_${nowIso().replace(/[-:.TZ]/g, "")}_${Math.random().toString(16).slice(2, 8)}`;

  const createdAt = nowIso();
  const source: CaseDoc["source"] = { channel: params.channel };
  if (params.threadId) source.threadId = params.threadId;
  if (params.userId) source.userId = params.userId;

  const doc: CaseDoc = {
    caseId,
    createdAt,
    updatedAt: createdAt,
    state: "DRAFT",
    source,
    complaint: {
      slug: params.complaintSlug,
      display: params.complaintDisplay,
      engine: params.engine,
    },
    answers: { structured: {}, answerHash: sha256Hex("{}") },
    triage: null,
    physicianReview: defaultReview(),
    messages: [],
  };

  await cases().doc(caseId).set(doc);
  return doc;
}

export async function getCase(caseId: string): Promise<CaseDoc | null> {
  const snap = await cases().doc(caseId).get();
  if (!snap.exists) return null;
  return snap.data() as CaseDoc;
}

export async function appendMessage(
  caseId: string,
  msg: CaseMessage
): Promise<void> {
  await cases()
    .doc(caseId)
    .update({
      updatedAt: nowIso(),
      messages: admin.firestore.FieldValue.arrayUnion(msg),
    });
}

export async function mergeAnswers(
  caseId: string,
  patch: Record<string, unknown>
): Promise<CaseDoc> {
  const doc = await getCase(caseId);
  if (!doc) throw new Error("Case not found");

  const merged = { ...(doc.answers?.structured ?? {}), ...patch };
  const answerHash = sha256Hex(JSON.stringify(merged));

  await cases().doc(caseId).update({
    updatedAt: nowIso(),
    "answers.structured": merged,
    "answers.answerHash": answerHash,
  });

  const next = await getCase(caseId);
  if (!next) throw new Error("Case not found after update");
  return next;
}

export async function setCaseState(
  caseId: string,
  state: CaseStatus
): Promise<void> {
  await cases().doc(caseId).update({ updatedAt: nowIso(), state });
}

export async function setTriage(
  caseId: string,
  triage: CaseDoc["triage"],
  nextState: CaseStatus
): Promise<void> {
  await cases().doc(caseId).update({
    updatedAt: nowIso(),
    triage,
    state: nextState,
  });
}

export async function setPhysicianReview(
  caseId: string,
  review: Partial<PhysicianReview>,
  nextState: CaseStatus
): Promise<void> {
  const doc = await getCase(caseId);
  if (!doc) throw new Error("Case not found");

  const merged: PhysicianReview = {
    ...defaultReview(),
    ...(doc.physicianReview ?? {}),
    ...review,
    reviewedAt: nowIso(),
  };

  await cases().doc(caseId).update({
    updatedAt: nowIso(),
    physicianReview: merged,
    state: nextState,
  });
}

export async function patchCaseDoc(
  caseId: string,
  patch: Record<string, unknown>
): Promise<void> {
  await cases().doc(caseId).update({ ...patch, updatedAt: nowIso() });
}

export async function listReviewQueue(params: {
  state?: "NEEDS_REVIEW" | "TRIAGED";
  limit?: number;
}): Promise<CaseDoc[]> {
  const limit = params.limit ?? 50;
  const state = params.state ?? "NEEDS_REVIEW";

  const q = cases()
    .where("state", "==", state)
    .limit(limit);
  const snaps = await q.get();
  const docs = snaps.docs.map((d) => d.data() as CaseDoc);
  docs.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  return docs;
}
