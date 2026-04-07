import crypto from "crypto";
import { db } from "../db";
import { auditLogs } from "../../shared/schema";
import { desc } from "drizzle-orm";

// ── Chain head ────────────────────────────────────────────────────────────────
// BUG FIXED: previously `let lastHash = "GENESIS"` — any server restart silently
// reset to GENESIS, creating orphaned chain fragments that look valid individually
// but are disconnected from all prior records. The DB-seed below fixes this.

let lastHash = "GENESIS";
let seeded = false;

/**
 * Seed the in-memory chain head from the most recent DB record.
 * MUST be called once at server startup before any audit writes.
 * Safe to call multiple times — subsequent calls are no-ops.
 */
export async function initChainFromDB(): Promise<void> {
  if (seeded) return;
  try {
    const [latest] = await db
      .select({ hash: auditLogs.hash })
      .from(auditLogs)
      .orderBy(desc(auditLogs.createdAt))
      .limit(1);

    if (latest?.hash) {
      lastHash = latest.hash;
      console.log(`[AUDIT-CHAIN] Resuming chain from hash ${lastHash.slice(0, 18)}…`);
    } else {
      console.log("[AUDIT-CHAIN] No prior records — starting from GENESIS");
    }
    seeded = true;
  } catch (e) {
    console.error("[AUDIT-CHAIN] Could not seed from DB — chain may be discontinuous:", e);
  }
}

// ── Deterministic serialisation ───────────────────────────────────────────────
// BUG FIXED: JSON.stringify key order is engine/V8 insertion-order dependent.
// Two logically identical objects with different insertion order produce different
// hashes, breaking cross-process verification. Sorting keys fixes this.
function stableStringify(obj: Record<string, unknown>): string {
  const recurse = (v: unknown): unknown => {
    if (v === null || typeof v !== "object") return v;
    if (Array.isArray(v)) return v.map(recurse);
    const sorted: Record<string, unknown> = {};
    for (const k of Object.keys(v as object).sort()) {
      sorted[k] = recurse((v as Record<string, unknown>)[k]);
    }
    return sorted;
  };
  return JSON.stringify(recurse(obj));
}

export function computeChainHash(prevHash: string, entry: Record<string, unknown>): string {
  const content = prevHash + stableStringify(entry);
  return crypto.createHash("sha256").update(content, "utf8").digest("hex");
}

export function advanceChain(entry: Record<string, unknown>): { hash: string; prevHash: string } {
  const prevHash = lastHash;
  const hash = computeChainHash(prevHash, entry);
  lastHash = hash;
  return { hash, prevHash };
}

export function getCurrentChainHead(): string {
  return lastHash;
}

export function isChainSeeded(): boolean {
  return seeded;
}

export function verifyChainLink(
  entry: Record<string, unknown>,
  prevHash: string,
  claimedHash: string,
): boolean {
  const expected = computeChainHash(prevHash, entry);
  try {
    // Both must be valid 64-char hex strings or timingSafeEqual throws
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(claimedHash, "hex");
    if (a.length !== 32 || b.length !== 32) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
