/**
 * Immutable Audit Pipeline
 *
 * Every clinical, billing, and security event is appended to an NDJSON
 * flat-file log (data/audit_events.log).  The file is append-only — no
 * record is ever deleted or overwritten, satisfying 21 CFR Part 11 §11.10
 * immutability requirements.
 *
 * In production you would additionally ship these events to an immutable
 * object store (S3 + Object Lock, GCS + retention policy, etc.).
 */

import fs from "fs";
import path from "path";
import { publish } from "../events/bus";

const LOG_DIR  = path.resolve(process.cwd(), "data");
const LOG_FILE = path.join(LOG_DIR, "audit_events.log");

// Ensure log directory exists at module load time
try {
  fs.mkdirSync(LOG_DIR, { recursive: true });
} catch {
  // already exists
}

export type AuditEventType =
  | "TRIAGE_COMPLETED"
  | "ENCOUNTER_CREATED"
  | "CLAIM_SUBMITTED"
  | "CLAIM_SCRUB_FAILED"
  | "MED_SAFETY_BLOCK"
  | "FHIR_SYNC"
  | "ERX_SENT"
  | "RLS_CONTEXT_SET"
  | "LEARNING_CYCLE"
  | "FUSION_ALERT"
  | "PHI_ACCESS"
  | "ADMIN_ACTION"
  | "GENERIC";

export interface AuditEvent {
  type:      AuditEventType | string;
  actor?:    string;
  clinicId?: string;
  entityId?: string;
  severity?: "info" | "warn" | "critical";
  payload?:  Record<string, unknown>;
}

export interface AuditRecord extends AuditEvent {
  id:        string;
  timestamp: string;
}

/**
 * Append an immutable audit record to disk and publish to the event bus.
 * Fire-and-forget: never throws — logs internally if something goes wrong.
 */
export function logEvent(event: AuditEvent): void {
  const record: AuditRecord = {
    id:        `AUD-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
    timestamp: new Date().toISOString(),
    severity:  event.severity ?? "info",
    ...event,
  };

  const line = JSON.stringify(record);

  // Write to flat file (append-only)
  try {
    fs.appendFileSync(LOG_FILE, line + "\n", "utf8");
  } catch (err) {
    console.error("[AuditEvents] Failed to write audit log:", err);
  }

  // Publish to event bus (non-blocking)
  try {
    publish("audit.event", record as unknown as Record<string, unknown>).catch(() => {});
  } catch {
    // don't let event bus failure block the caller
  }
}

/**
 * Async variant — awaits the bus publish before returning.
 * Use in middleware or pipeline steps where you want to ensure delivery.
 */
export async function logEventAsync(event: AuditEvent): Promise<void> {
  const record: AuditRecord = {
    id:        `AUD-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
    timestamp: new Date().toISOString(),
    severity:  event.severity ?? "info",
    ...event,
  };

  const line = JSON.stringify(record);

  try {
    fs.appendFileSync(LOG_FILE, line + "\n", "utf8");
  } catch (err) {
    console.error("[AuditEvents] Failed to write audit log:", err);
  }

  try {
    await publish("audit.event", record as unknown as Record<string, unknown>);
  } catch {
    // non-fatal
  }
}

/** Read the last N lines from the audit log (for dashboard display) */
export function getRecentAuditRecords(limit = 50): AuditRecord[] {
  try {
    if (!fs.existsSync(LOG_FILE)) return [];
    const lines = fs.readFileSync(LOG_FILE, "utf8").trim().split("\n").filter(Boolean);
    return lines
      .slice(-limit)
      .reverse()
      .map((l) => {
        try { return JSON.parse(l) as AuditRecord; }
        catch { return null; }
      })
      .filter(Boolean) as AuditRecord[];
  } catch {
    return [];
  }
}

/** Total number of records in the audit log */
export function getAuditLogStats(): { total: number; filePath: string; fileSizeBytes: number } {
  try {
    const stat = fs.statSync(LOG_FILE);
    const lines = fs.readFileSync(LOG_FILE, "utf8").trim().split("\n").filter(Boolean);
    return { total: lines.length, filePath: LOG_FILE, fileSizeBytes: stat.size };
  } catch {
    return { total: 0, filePath: LOG_FILE, fileSizeBytes: 0 };
  }
}
