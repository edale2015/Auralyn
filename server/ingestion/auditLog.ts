/**
 * I001 — Ingestion audit log.
 * Every fetch — success or failure — writes one row to ingestion_audit.
 * This is the regulatory-grade record of every external data pull.
 */

import { db } from "../db";
import { sql } from "drizzle-orm";
import crypto from "crypto";

export interface AuditEntry {
  sourceId:     string;
  url:          string;
  httpStatus?:  number;
  payloadBytes?: number;
  payloadHash?: string;
  durationMs:   number;
  error?:       string;
}

export async function logFetch(entry: AuditEntry): Promise<void> {
  try {
    const id = `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await db.execute(sql`
      INSERT INTO ingestion_audit
        (id, source_id, url, http_status, payload_hash, payload_bytes, error, duration_ms)
      VALUES
        (${id}, ${entry.sourceId}, ${entry.url},
         ${entry.httpStatus ?? null}, ${entry.payloadHash ?? null},
         ${entry.payloadBytes ?? null}, ${entry.error ?? null},
         ${entry.durationMs})
    `);
  } catch (e) {
    // Audit log failure is non-fatal — log to console but don't throw
    console.warn("[IngestionAudit] Failed to write audit row:", (e as Error).message);
  }
}

export function hashPayload(raw: unknown): { hash: string; bytes: number } {
  const str   = typeof raw === "string" ? raw : JSON.stringify(raw);
  const hash  = crypto.createHash("sha256").update(str).digest("hex");
  const bytes = Buffer.byteLength(str, "utf8");
  return { hash, bytes };
}
