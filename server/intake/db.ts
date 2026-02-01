import Database from "better-sqlite3";
import * as path from "path";

const DB_PATH = process.env.INTAKE_DB_PATH || path.join(process.cwd(), "intake.sqlite");
export const db = new Database(DB_PATH);

export function initIntakeDb() {
  db.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS intake_sessions (
      token TEXT PRIMARY KEY,
      code_hash TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      used_at INTEGER,
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
      summary_pdf_path TEXT
    );

    CREATE TABLE IF NOT EXISTS files (
      file_id TEXT PRIMARY KEY,
      token TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      storage_path TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_cases_token ON cases(token);
    CREATE INDEX IF NOT EXISTS idx_files_token ON files(token);
  `);
}
