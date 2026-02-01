import admin from "firebase-admin";
import type { StorageDriver } from "./store";
import type { DraftPayload, SubmitPayload, StatusResult, FileMeta } from "./types";
import { sha256 } from "./crypto";
import { renderSummaryHtml, saveSummaryHtml } from "../intake/pdf";

function nowMs() { return Date.now(); }

function statusText(s: string) {
  if (s === "draft") return "Continue your intake.";
  if (s === "submitted") return "Submitted. Provider review pending.";
  if (s === "in_review") return "In review.";
  if (s === "signed") return "Complete. Summary available.";
  if (s === "closed") return "Closed.";
  return "Unknown.";
}

const SESSION_DURATION_MS = 30 * 60 * 1000;

function initFirebase() {
  if (admin.apps.length) return;
  admin.initializeApp({
    projectId: process.env.FIREBASE_PROJECT_ID
  });
}

export function makeFirestoreStore(): StorageDriver {
  initFirebase();
  const db = admin.firestore();

  const sessions = db.collection("intake_sessions");
  const cases = db.collection("cases");
  const files = db.collection("files");

  return {
    async createSession(token, code, expiresAtMs) {
      await sessions.doc(token).set({
        token,
        code_hash: sha256(code.trim()),
        expires_at: expiresAtMs,
        used_at: null,
        verified_at: null,
        session_expires_at: null,
        created_at: nowMs()
      }, { merge: true });
    },

    async verifySession(token, code) {
      const snap = await sessions.doc(token).get();
      if (!snap.exists) throw new Error("Invalid link.");
      const s: any = snap.data();
      if (s.used_at) throw new Error("This link has already been used.");
      if (Number(s.expires_at) < nowMs()) throw new Error("This link has expired.");
      if (sha256(code.trim()) !== s.code_hash) throw new Error("Incorrect code.");

      const sessionExpiresAt = nowMs() + SESSION_DURATION_MS;
      await sessions.doc(token).set({
        verified_at: nowMs(),
        session_expires_at: sessionExpiresAt
      }, { merge: true });
    },

    async isSessionVerified(token) {
      const snap = await sessions.doc(token).get();
      if (!snap.exists) return false;
      const s: any = snap.data();
      if (s.used_at) return false;
      if (!s.verified_at) return false;
      if (s.session_expires_at && Number(s.session_expires_at) < nowMs()) return false;
      return true;
    },

    async markSessionUsed(token) {
      await sessions.doc(token).set({ used_at: nowMs() }, { merge: true });
    },

    async getOrCreateCaseForToken(token) {
      const q = await cases.where("token", "==", token).orderBy("created_at", "desc").limit(1).get();
      if (!q.empty) {
        const doc = q.docs[0];
        const d: any = doc.data();
        return { caseId: d.case_id, status: d.status, currentStep: d.current_step ?? 0 };
      }

      const caseId = `CASE_${nowMs()}_${Math.random().toString(16).slice(2)}`;
      const ts = nowMs();
      await cases.doc(caseId).set({
        case_id: caseId,
        token,
        status: "draft",
        created_at: ts,
        updated_at: ts,
        current_step: 0,
        draft_json: {},
        intake_json: {},
        assistant_json: {},
        summary_html: null
      });

      return { caseId, status: "draft", currentStep: 0 };
    },

    async setCaseDraft(token, draft: DraftPayload) {
      const { caseId } = await this.getOrCreateCaseForToken(token);
      const ref = cases.doc(caseId);

      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const data: any = snap.exists ? snap.data() : {};
        const existingDraft = data?.draft_json || {};
        const merged = { ...existingDraft, ...draft.draft };

        tx.set(ref, {
          draft_json: merged,
          current_step: draft.currentStep,
          status: "draft",
          updated_at: nowMs()
        }, { merge: true });
      });
    },

    async setCaseSubmitted(token, intake: SubmitPayload, assistant: any) {
      const { caseId } = await this.getOrCreateCaseForToken(token);
      await cases.doc(caseId).set({
        intake_json: intake,
        assistant_json: assistant,
        status: "submitted",
        updated_at: nowMs()
      }, { merge: true });

      await sessions.doc(token).set({ used_at: nowMs() }, { merge: true });
      return { caseId };
    },

    async getStatus(token): Promise<StatusResult> {
      const q = await cases.where("token", "==", token).orderBy("created_at", "desc").limit(1).get();
      if (q.empty) throw new Error("Not found.");
      const d: any = q.docs[0].data();
      return {
        ok: true,
        caseId: d.case_id,
        status: d.status,
        updatedAt: d.updated_at,
        nextActionText: statusText(d.status)
      };
    },

    async getSummaryHtml(token) {
      const q = await cases.where("token", "==", token).orderBy("created_at", "desc").limit(1).get();
      if (q.empty) throw new Error("Not found.");
      const d: any = q.docs[0].data();
      if (d.status !== "signed") throw new Error("Summary not available yet.");
      return d.summary_html || "<html><body>No summary.</body></html>";
    },

    async signCase(caseId: string) {
      const ref = cases.doc(caseId);
      const snap = await ref.get();
      if (!snap.exists) throw new Error("Not found.");
      const d: any = snap.data();

      const html = renderSummaryHtml(caseId, d.intake_json || {}, d.assistant_json || {});
      saveSummaryHtml(caseId, html);
      await ref.set({
        status: "signed",
        summary_html: html,
        updated_at: nowMs()
      }, { merge: true });
    },

    async getCase(caseId: string) {
      const snap = await cases.doc(caseId).get();
      if (!snap.exists) throw new Error("Not found.");
      const d: any = snap.data();
      return {
        caseId: d.case_id,
        status: d.status,
        intake: d.intake_json || {},
        assistant: d.assistant_json || {},
        updatedAt: d.updated_at
      };
    },

    async addFileMeta(meta: FileMeta) {
      await files.doc(meta.fileId).set(meta, { merge: true });
    },

    async getFileMeta(fileId: string) {
      const snap = await files.doc(fileId).get();
      if (!snap.exists) return null;
      return snap.data() as FileMeta;
    },

    async getFileMetaByToken(token: string) {
      const q = await files.where("token", "==", token).get();
      return q.docs.map(doc => doc.data() as FileMeta);
    }
  };
}
