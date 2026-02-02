import Database from "better-sqlite3";
import path from "path";
import type { StorageDriver, CaseData } from "./store";
import type { DraftPayload, SubmitPayload, StatusResult, FileMeta, ExternalEhr } from "./types";
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

export function makeSqliteStore(): StorageDriver {
  const dbPath = process.env.DB_PATH || path.join(process.cwd(), "data.sqlite");
  const db = new Database(dbPath);

  db.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS intake_sessions (
      token TEXT PRIMARY KEY,
      code_hash TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      used_at INTEGER,
      verified_at INTEGER,
      session_expires_at INTEGER,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cases (
      case_id TEXT PRIMARY KEY,
      token TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      current_step INTEGER DEFAULT 0,
      draft_json TEXT DEFAULT '{}',
      intake_json TEXT DEFAULT '{}',
      assistant_json TEXT DEFAULT '{}',
      summary_html TEXT,
      external_ehr_json TEXT DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS files (
      file_id TEXT PRIMARY KEY,
      token TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      storage_mode TEXT NOT NULL DEFAULT 'local_disk',
      storage_path TEXT NOT NULL,
      bucket TEXT,
      object_path TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_cases_token ON cases(token);
    CREATE INDEX IF NOT EXISTS idx_files_token ON files(token);
  `);

  try {
    db.exec(`ALTER TABLE intake_sessions ADD COLUMN verified_at INTEGER`);
  } catch {}
  try {
    db.exec(`ALTER TABLE intake_sessions ADD COLUMN session_expires_at INTEGER`);
  } catch {}
  try {
    db.exec(`ALTER TABLE files ADD COLUMN storage_mode TEXT NOT NULL DEFAULT 'local_disk'`);
  } catch {}
  try {
    db.exec(`ALTER TABLE files ADD COLUMN bucket TEXT`);
  } catch {}
  try {
    db.exec(`ALTER TABLE files ADD COLUMN object_path TEXT`);
  } catch {}
  try {
    db.exec(`ALTER TABLE cases ADD COLUMN external_ehr_json TEXT DEFAULT '{}'`);
  } catch {}

  return {
    async createSession(token, code, expiresAtMs) {
      const hash = sha256(code.trim());
      db.prepare(`
        INSERT OR REPLACE INTO intake_sessions (token, code_hash, expires_at, used_at, verified_at, session_expires_at, created_at)
        VALUES (?, ?, ?, NULL, NULL, NULL, ?)
      `).run(token, hash, expiresAtMs, nowMs());
    },

    async verifySession(token, code) {
      const session = db.prepare(`SELECT * FROM intake_sessions WHERE token = ?`).get(token) as any;
      if (!session) throw new Error("Invalid link.");
      if (session.used_at) throw new Error("This link has already been used.");
      if (Number(session.expires_at) < nowMs()) throw new Error("This link has expired.");
      const codeHash = sha256(code.trim());
      if (codeHash !== session.code_hash) throw new Error("Incorrect code.");

      const sessionExpiresAt = nowMs() + SESSION_DURATION_MS;
      db.prepare(`
        UPDATE intake_sessions SET verified_at = ?, session_expires_at = ? WHERE token = ?
      `).run(nowMs(), sessionExpiresAt, token);

      return { sessionExpiresAtMs: sessionExpiresAt };
    },

    async isSessionVerified(token) {
      const session = db.prepare(`SELECT * FROM intake_sessions WHERE token = ?`).get(token) as any;
      if (!session) return false;
      if (session.used_at) return false;
      if (!session.verified_at) return false;
      if (session.session_expires_at && Number(session.session_expires_at) < nowMs()) return false;
      return true;
    },

    async markSessionUsed(token) {
      db.prepare(`UPDATE intake_sessions SET used_at = ? WHERE token = ?`).run(nowMs(), token);
    },

    async getOrCreateCaseForToken(token) {
      const row = db.prepare(`SELECT * FROM cases WHERE token = ? ORDER BY created_at DESC LIMIT 1`).get(token) as any;
      if (row) return { caseId: row.case_id, status: row.status, currentStep: row.current_step };

      const caseId = `CASE_${nowMs()}_${Math.random().toString(16).slice(2)}`;
      const ts = nowMs();
      db.prepare(`
        INSERT INTO cases (case_id, token, status, created_at, updated_at, current_step, draft_json, intake_json, assistant_json)
        VALUES (?, ?, ?, ?, ?, 0, '{}', '{}', '{}')
      `).run(caseId, token, "draft", ts, ts);

      return { caseId, status: "draft", currentStep: 0 };
    },

    async setCaseDraft(token, draft) {
      let row = db.prepare(`SELECT * FROM cases WHERE token = ? ORDER BY created_at DESC LIMIT 1`).get(token) as any;
      if (!row) {
        await this.getOrCreateCaseForToken(token);
        row = db.prepare(`SELECT * FROM cases WHERE token = ? ORDER BY created_at DESC LIMIT 1`).get(token) as any;
      }

      let currentDraft: any = {};
      try { currentDraft = JSON.parse(row.draft_json || "{}"); } catch {}
      const merged = { ...currentDraft, ...draft.draft };

      db.prepare(`
        UPDATE cases SET draft_json=?, current_step=?, updated_at=?, status='draft'
        WHERE case_id=?
      `).run(JSON.stringify(merged), draft.currentStep, nowMs(), row.case_id);
    },

    async setCaseSubmitted(token, intake, assistant) {
      let row = db.prepare(`SELECT * FROM cases WHERE token = ? ORDER BY created_at DESC LIMIT 1`).get(token) as any;
      const caseId = row?.case_id || (await this.getOrCreateCaseForToken(token)).caseId;

      db.prepare(`
        UPDATE cases SET intake_json=?, assistant_json=?, status='submitted', updated_at=?
        WHERE case_id=?
      `).run(JSON.stringify(intake), JSON.stringify(assistant), nowMs(), caseId);

      db.prepare(`UPDATE intake_sessions SET used_at=? WHERE token=?`).run(nowMs(), token);

      return { caseId };
    },

    async getStatus(token): Promise<StatusResult> {
      const row = db.prepare(`SELECT * FROM cases WHERE token = ? ORDER BY created_at DESC LIMIT 1`).get(token) as any;
      if (!row) throw new Error("Not found.");
      return {
        ok: true,
        caseId: row.case_id,
        status: row.status,
        updatedAt: row.updated_at,
        nextActionText: statusText(row.status)
      };
    },

    async getSummaryHtml(token) {
      const row = db.prepare(`SELECT * FROM cases WHERE token = ? ORDER BY created_at DESC LIMIT 1`).get(token) as any;
      if (!row) throw new Error("Not found.");
      if (row.status !== "signed") throw new Error("Summary not available yet.");
      return row.summary_html || "<html><body>No summary.</body></html>";
    },

    async signCase(caseId: string) {
      const row = db.prepare(`SELECT * FROM cases WHERE case_id = ?`).get(caseId) as any;
      if (!row) throw new Error("Not found.");
      const intake = JSON.parse(row.intake_json || "{}");
      const assistant = JSON.parse(row.assistant_json || "{}");
      const html = renderSummaryHtml(caseId, intake, assistant);
      saveSummaryHtml(caseId, html);
      db.prepare(`UPDATE cases SET status='signed', summary_html=?, updated_at=? WHERE case_id=?`)
        .run(html, nowMs(), caseId);
    },

    async getCase(caseId: string): Promise<CaseData> {
      const row = db.prepare(`SELECT * FROM cases WHERE case_id = ?`).get(caseId) as any;
      if (!row) throw new Error("Not found.");
      let externalEhr: ExternalEhr | undefined;
      try { externalEhr = JSON.parse(row.external_ehr_json || "{}"); } catch {}
      if (externalEhr && (!externalEhr.vendor || externalEhr.vendor === "none")) {
        externalEhr = undefined;
      }
      return {
        caseId: row.case_id,
        status: row.status,
        intake: JSON.parse(row.intake_json || "{}"),
        assistant: JSON.parse(row.assistant_json || "{}"),
        updatedAt: row.updated_at,
        externalEhr
      };
    },

    async setExternalEhr(caseId: string, ehr: ExternalEhr) {
      db.prepare(`UPDATE cases SET external_ehr_json=?, updated_at=? WHERE case_id=?`)
        .run(JSON.stringify(ehr), nowMs(), caseId);
    },

    async getExternalEhr(caseId: string): Promise<ExternalEhr | null> {
      const row = db.prepare(`SELECT external_ehr_json FROM cases WHERE case_id = ?`).get(caseId) as any;
      if (!row) return null;
      try { 
        const ehr = JSON.parse(row.external_ehr_json || "{}"); 
        if (!ehr.vendor || ehr.vendor === "none") return null;
        return ehr;
      } catch { return null; }
    },

    async addFileMeta(meta: FileMeta) {
      db.prepare(`
        INSERT INTO files (file_id, token, original_name, mime_type, storage_mode, storage_path, bucket, object_path, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        meta.fileId, 
        meta.token, 
        meta.originalName, 
        meta.mimeType, 
        meta.storageMode || "local_disk",
        meta.storagePath, 
        meta.bucket || null,
        meta.objectPath || null,
        meta.createdAt
      );
    },

    async getFileMeta(fileId: string) {
      const row = db.prepare(`SELECT * FROM files WHERE file_id = ?`).get(fileId) as any;
      if (!row) return null;
      return {
        fileId: row.file_id,
        token: row.token,
        originalName: row.original_name,
        mimeType: row.mime_type,
        storageMode: row.storage_mode || "local_disk",
        storagePath: row.storage_path,
        bucket: row.bucket,
        objectPath: row.object_path,
        createdAt: row.created_at
      } as FileMeta;
    },

    async getFileMetaByToken(token: string) {
      const rows = db.prepare(`SELECT * FROM files WHERE token = ?`).all(token) as any[];
      return rows.map(row => ({
        fileId: row.file_id,
        token: row.token,
        originalName: row.original_name,
        mimeType: row.mime_type,
        storageMode: row.storage_mode || "local_disk",
        storagePath: row.storage_path,
        bucket: row.bucket,
        objectPath: row.object_path,
        createdAt: row.created_at
      } as FileMeta));
    }
  };
}
