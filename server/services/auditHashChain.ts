import { createHash } from "crypto";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { appendExternalAuditRecord } from "../audit/externalAuditStore";

export interface HashedAuditEntry {
  id?: number;
  event_type: string;
  event_data: Record<string, unknown>;
  actor?: string;
  timestamp: string;
  hash: string;
  prev_hash: string;
}

let lastHash = "GENESIS";

function computeHash(prevHash: string, eventType: string, eventData: unknown, timestamp: string): string {
  const payload = JSON.stringify({ prevHash, eventType, eventData, timestamp });
  return createHash("sha256").update(payload).digest("hex");
}

export async function appendAuditEntry(
  eventType: string,
  eventData: Record<string, unknown>,
  actor?: string
): Promise<string> {
  const timestamp = new Date().toISOString();
  const hash = computeHash(lastHash, eventType, eventData, timestamp);
  const prevHash = lastHash;
  lastHash = hash;

  try {
    await db.execute(sql`
      INSERT INTO audit_hash_chain (event_type, event_data, actor, timestamp, hash, prev_hash)
      VALUES (
        ${eventType},
        CAST(${JSON.stringify(eventData)} AS jsonb),
        ${actor ?? "system"},
        ${timestamp},
        ${hash},
        ${prevHash}
      )
    `);
    await appendExternalAuditRecord({ eventType, eventData, actor: actor ?? "system", timestamp, hash, prevHash });
  } catch (e: any) {
    console.error("[AUDIT-CHAIN] Failed to persist audit entry:", e?.message);
  }

  return hash;
}

export async function verifyAuditChain(): Promise<{
  valid: boolean;
  totalEntries: number;
  firstBrokenAt?: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let firstBrokenAt: number | undefined;

  try {
    const result = await db.execute(sql`
      SELECT id, event_type, event_data, actor, timestamp, hash, prev_hash
      FROM audit_hash_chain
      ORDER BY id ASC
    `);
    const rows = (result.rows ?? result) as HashedAuditEntry[];

    let expectedPrev = "GENESIS";
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const expectedHash = computeHash(expectedPrev, row.event_type, row.event_data, row.timestamp);

      if (row.prev_hash !== expectedPrev) {
        errors.push(`Entry ${row.id}: prev_hash mismatch (expected ${expectedPrev.slice(0, 8)}…, got ${row.prev_hash?.slice(0, 8)}…)`);
        if (!firstBrokenAt) firstBrokenAt = i + 1;
      }
      if (row.hash !== expectedHash) {
        errors.push(`Entry ${row.id}: hash mismatch — entry may have been tampered`);
        if (!firstBrokenAt) firstBrokenAt = i + 1;
      }

      expectedPrev = row.hash;
    }

    return { valid: errors.length === 0, totalEntries: rows.length, firstBrokenAt, errors };
  } catch (e: any) {
    return { valid: false, totalEntries: 0, errors: [`Chain read failed: ${e?.message}`] };
  }
}

export async function initAuditHashChain(): Promise<void> {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS audit_hash_chain (
        id          SERIAL PRIMARY KEY,
        event_type  TEXT NOT NULL,
        event_data  JSONB NOT NULL DEFAULT '{}',
        actor       TEXT,
        timestamp   TEXT NOT NULL,
        hash        TEXT NOT NULL,
        prev_hash   TEXT NOT NULL,
        created_at  TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    const last = await db.execute(sql`SELECT hash FROM audit_hash_chain ORDER BY id DESC LIMIT 1`);
    const lastRow = ((last.rows ?? last) as any[])[0];
    if (lastRow?.hash) {
      lastHash = lastRow.hash;
      console.log(`[AUDIT-CHAIN] Resuming chain from hash ${lastHash.slice(0, 16)}…`);
    } else {
      console.log("[AUDIT-CHAIN] Starting new hash chain from GENESIS");
    }
  } catch (e: any) {
    console.error("[AUDIT-CHAIN] Init failed:", e?.message);
  }
}
