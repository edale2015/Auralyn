import { db } from "../db";
import { auditLogs } from "../../shared/schema";
import { eq, asc, desc, sql } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { computeChainHash, verifyChainLink } from "./hashChain";

// ── Trace ID ──────────────────────────────────────────────────────────────────

export function createTraceId(): string {
  return uuidv4();
}

// ── Failure-safe serialization queue ─────────────────────────────────────────
//
// WHY A QUEUE:
//   Two concurrent auditStep() calls would both read the same prevHash from DB,
//   compute two hashes with the same prevHash, and insert two rows — a fork.
//   The chain has two entries claiming the same parent. Neither call is wrong
//   individually, but the chain is permanently broken.
//
// WHY enqueueExclusive INSTEAD OF chainMutex = chainMutex.then(fn):
//   A naive mutex poisons itself after one failure — all subsequent calls chain
//   onto a rejected promise and never run. One DB hiccup bricks all future
//   audit writes for the lifetime of the process.
//
//   enqueueExclusive runs the new work regardless of whether the previous item
//   succeeded or failed (fn, fn catches both paths), then resets the queue to a
//   clean resolved promise so future enqueues are unaffected.
//
// MULTI-INSTANCE:
//   This mutex is in-process only. The PostgreSQL advisory lock below
//   serializes across all server instances sharing the same DB.

let chainQueue: Promise<unknown> = Promise.resolve();

function enqueueExclusive<T>(fn: () => Promise<T>): Promise<T> {
  const run = chainQueue.then(fn, fn);
  chainQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

// ── Advisory lock constant ────────────────────────────────────────────────────
//
// pg_advisory_xact_lock acquires an exclusive lock released at transaction end.
// Using the same integer across all processes means only one writer can advance
// the chain at a time — on any instance connected to the same DB.
const AUDIT_CHAIN_LOCK = BigInt(91424017);

// ── auditStep ─────────────────────────────────────────────────────────────────
//
// Key design decisions:
//  1. Chain head is always read from DB inside the lock — never from a module
//     variable. Server restart cannot silently fork the chain.
//  2. Hash is computed AFTER acquiring the lock. Concurrent callers are
//     serialized; each sees the true previous hash.
//  3. Hash and insert are inside a single transaction. If the insert fails,
//     no hash is committed and the chain is unchanged.
//  4. Errors are NOT swallowed. The original silently caught all errors, making
//     chain corruption completely invisible. Callers decide how to handle.
//  5. Row ordering uses monotonic serial id, not createdAt — two rows can share
//     a timestamp but never share an id.

export async function auditStep({
  traceId,
  step,
  input,
  output,
  metadata = {},
}: {
  traceId:   string;
  step:      string;
  input:     unknown;
  output:    unknown;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await enqueueExclusive(async () => {
    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${AUDIT_CHAIN_LOCK})`);

      const last = await tx
        .select({ id: auditLogs.id, hash: auditLogs.hash })
        .from(auditLogs)
        .orderBy(desc(auditLogs.id))
        .limit(1);

      const prevHash = last.length > 0 ? last[0].hash! : "GENESIS";

      const entry: Record<string, unknown> = {
        traceId,
        step,
        input:    input    ?? null,
        output:   output   ?? null,
        metadata: metadata ?? {},
      };

      const hash = computeChainHash(prevHash, entry);

      await tx.insert(auditLogs).values({
        traceId,
        step,
        input:    input    ?? null,
        output:   output   ?? null,
        metadata: metadata ?? {},
        prevHash,
        hash,
      });
    });
  });
}

// ── Query helpers ─────────────────────────────────────────────────────────────

export async function getTraceSteps(traceId: string) {
  try {
    return await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.traceId, traceId))
      .orderBy(asc(auditLogs.id));
  } catch (e) {
    console.error("[AuditLogger] getTraceSteps error:", e);
    return [];
  }
}

export async function getRecentAuditLogs(limit = 50) {
  try {
    return await db
      .select()
      .from(auditLogs)
      .orderBy(desc(auditLogs.id))
      .limit(limit);
  } catch (e) {
    console.error("[AuditLogger] getRecentAuditLogs error:", e);
    return [];
  }
}

// ── Full chain verification ───────────────────────────────────────────────────
//
// verifyChainLink() checks ONE link in isolation.
// verifyEntireChain() walks every row in order and proves no gaps, forks, or
// tampered entries exist. Required for FDA 21 CFR Part 11 audit posture.
// Expose via a governance route behind admin auth.

export async function verifyEntireChain(): Promise<{
  ok:           boolean;
  totalEntries: number;
  brokenAtId?:  number;
  reason?:      string;
}> {
  try {
    const rows = await db
      .select()
      .from(auditLogs)
      .orderBy(asc(auditLogs.id));

    let expectedPrev = "GENESIS";

    for (const row of rows) {
      if (!row.hash || !row.prevHash) {
        return {
          ok: false, totalEntries: rows.length,
          brokenAtId: row.id,
          reason: "null hash or prevHash — row predates hash chain",
        };
      }

      if (row.prevHash !== expectedPrev) {
        return {
          ok: false, totalEntries: rows.length,
          brokenAtId: row.id,
          reason: "prevHash mismatch — chain forked or rows inserted out of order",
        };
      }

      const entry: Record<string, unknown> = {
        traceId:  row.traceId,
        step:     row.step,
        input:    row.input    ?? null,
        output:   row.output   ?? null,
        metadata: row.metadata ?? {},
      };

      if (!verifyChainLink(entry, row.prevHash, row.hash)) {
        return {
          ok: false, totalEntries: rows.length,
          brokenAtId: row.id,
          reason: "hash mismatch — entry may have been tampered",
        };
      }

      expectedPrev = row.hash;
    }

    return { ok: true, totalEntries: rows.length };
  } catch (e: any) {
    return { ok: false, totalEntries: 0, reason: `Chain read failed: ${e?.message}` };
  }
}
