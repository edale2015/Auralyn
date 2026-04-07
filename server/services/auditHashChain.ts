import { createHash } from "crypto";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { appendExternalAuditRecord } from "../audit/externalAuditStore";
import { stableStringify } from "../audit/hashChain";

export interface HashedAuditEntry {
  id?: number;
  event_type: string;
  event_data: Record<string, unknown>;
  actor?: string;
  timestamp: string;
  hash: string;
  prev_hash: string;
}

// ── In-memory chain head ──────────────────────────────────────────────────────
// Seeded from DB at startup via initAuditHashChain().
// Protected against concurrent writes by:
//  1. enqueueExclusive (in-process serialisation)
//  2. pg_advisory_xact_lock (cross-instance serialisation)
let lastHash = "GENESIS";

// ── Failure-safe queue (mirrors auditLogger.ts pattern) ───────────────────────
let chainQueue: Promise<unknown> = Promise.resolve();
function enqueueExclusive<T>(fn: () => Promise<T>): Promise<T> {
  const run = chainQueue.then(fn, fn);
  chainQueue = run.then(() => undefined, () => undefined);
  return run;
}

// Different lock ID from audit_logs path (91424017) — these are separate tables
const AUDIT_CHAIN_LOCK = BigInt(91424018);

// ── Hash computation ──────────────────────────────────────────────────────────
// FIX: was JSON.stringify — key order is insertion-order dependent.
// stableStringify sorts keys recursively so the same logical payload always
// produces the same hash, even across restarts or differently constructed objects.
function computeHash(
  prevHash: string,
  eventType: string,
  eventData: unknown,
  timestamp: string,
): string {
  const payload = stableStringify({ prevHash, eventType, eventData, timestamp });
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

// ── appendAuditEntry ──────────────────────────────────────────────────────────
// FIX: original advanced lastHash in memory BEFORE the DB write. If the write
// failed, lastHash was permanently out of sync — the next successful write would
// chain off a hash that was never persisted, creating an unverifiable gap.
// Now: hash is computed and memory is advanced ONLY after a successful DB write.
export async function appendAuditEntry(
  eventType: string,
  eventData: Record<string, unknown>,
  actor?: string,
): Promise<string> {
  return enqueueExclusive(async () => {
    const timestamp = new Date().toISOString();

    await db.execute(sql`SELECT pg_advisory_xact_lock(${AUDIT_CHAIN_LOCK})`);

    // Re-read the chain head inside the lock to handle multi-instance deployments
    const headResult = await db.execute(sql`SELECT hash FROM audit_hash_chain ORDER BY id DESC LIMIT 1`);
    const headRow = ((headResult.rows ?? headResult) as any[])[0];
    const prevHash = headRow?.hash ?? "GENESIS";

    const hash = computeHash(prevHash, eventType, eventData, timestamp);

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

    // Only update in-memory head after successful write
    lastHash = hash;

    // Non-fatal: external audit record failure should not break the chain write
    try {
      await appendExternalAuditRecord({ eventType, eventData, actor: actor ?? "system", timestamp, hash, prevHash });
    } catch (e: any) {
      console.error("[AUDIT-CHAIN] External audit record failed (non-fatal):", e?.message);
    }

    return hash;
  });
}

// ── verifyAuditChain ──────────────────────────────────────────────────────────
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

// ── initAuditHashChain ────────────────────────────────────────────────────────
// Seeds the in-memory chain head from the DB. Called once at server startup.
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
