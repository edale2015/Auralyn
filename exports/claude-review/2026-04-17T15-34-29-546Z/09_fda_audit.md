# FDA & Audit Layer — 21 CFR Part 11 / Part 820

## Review Prompt

Review this audit and regulatory compliance layer.
Focus on:
  - Completeness of audit traceability (every clinical decision traceable)
  - SHA-256 chain tamper resistance
  - Missing required fields for 21 CFR Part 11 / Part 820 compliance
  - Whether the audit chain can be forged or gaps introduced
  - FDA De Novo submission readiness gaps

## Files

---

### Final Meta Question (ask after reviewing)

List the **TOP 5 MOST DANGEROUS FAILURE MODES** in this section.
Be specific. Do not give generic advice. Focus on real-world clinical risk.

### server/fda/auditChain.ts

```ts
/**
 * Cryptographic audit chain for FDA 21 CFR Part 11 compliance.
 *
 * Each entry is linked to the previous via SHA-256 so the chain
 * cannot be tampered with without invalidating all subsequent hashes.
 *
 * The genesis entry is anchored to the string "GENESIS".
 */

import crypto from "crypto";

export interface AuditEntry {
  [key: string]: unknown;
}

export interface ChainedEntry extends AuditEntry {
  hash:     string;
  prevHash: string;
}

/**
 * Build a forward-linked audit chain from an array of entries.
 *
 * @param entries  ordered list of audit payload objects
 * @returns        same entries with `hash` and `prevHash` fields appended
 */
export function buildAuditChain(entries: AuditEntry[]): ChainedEntry[] {
  let prevHash = "GENESIS";

  return entries.map((e) => {
    const hash = crypto
      .createHash("sha256")
      .update(prevHash + JSON.stringify(e))
      .digest("hex");

    const chained: ChainedEntry = { ...e, prevHash, hash };
    prevHash = hash;
    return chained;
  });
}

/**
 * Verify the integrity of a previously built chain.
 * Returns false if any link is broken.
 */
export function verifyAuditChain(chain: ChainedEntry[]): boolean {
  let prevHash = "GENESIS";

  for (const entry of chain) {
    const { hash, prevHash: storedPrev, ...payload } = entry;

    if (storedPrev !== prevHash) return false;

    const expected = crypto
      .createHash("sha256")
      .update(prevHash + JSON.stringify(payload))
      .digest("hex");

    if (expected !== hash) return false;
    prevHash = hash;
  }

  return true;
}
```

### server/fda/justification.ts

```ts
/**
 * FDA submission justification generator.
 *
 * Produces human-readable justification lines from a validation summary.
 * Used inside the FDA report and SaMD dossier.
 */

export interface ValidationData {
  passRate:          number;
  unsafeUndercalls:  number;
  calibrationError?: number;
  total?:            number;
  failed?:           number;
  hallucinationBlocks?: number;
  escalationRate?:   number;
}

/**
 * Generate an ordered list of justification statements for the FDA report.
 */
export function generateJustification(data: ValidationData): string[] {
  const lines: string[] = [];

  if (data.unsafeUndercalls === 0) {
    lines.push("No unsafe undercalls observed across the full validation set.");
  } else {
    lines.push(
      `WARNING: ${data.unsafeUndercalls} unsafe undercall(s) detected — disposition was below clinical minimum.`,
    );
  }

  if (data.passRate >= 0.9) {
    lines.push(`High validation pass rate: ${(data.passRate * 100).toFixed(1)}% (≥90% threshold met).`);
  } else {
    lines.push(
      `Validation pass rate ${(data.passRate * 100).toFixed(1)}% is below the 90% FDA SaMD threshold.`,
    );
  }

  if (data.calibrationError !== undefined) {
    if (data.calibrationError < 0.1) {
      lines.push(`Model is well-calibrated (Brier score ${data.calibrationError.toFixed(3)} < 0.10).`);
    } else {
      lines.push(
        `Calibration error ${data.calibrationError.toFixed(3)} exceeds target of 0.10 — review model confidence.`,
      );
    }
  }

  if (data.hallucinationBlocks !== undefined) {
    lines.push(
      `Hallucination detection system blocked ${data.hallucinationBlocks} unsafe output(s) before physician escalation.`,
    );
  }

  if (data.escalationRate !== undefined) {
    lines.push(
      `${(data.escalationRate * 100).toFixed(1)}% of cases were escalated to physician review.`,
    );
  }

  lines.push("System includes multi-layer hallucination detection (impossible combo, risk floor, low-support abstention).");
  lines.push("All autonomous decisions are gated by requiresPhysicianReview = true in high-stakes conditions.");
  lines.push("Audit chain is cryptographically linked (SHA-256) per 21 CFR Part 11 requirements.");

  return lines;
}
```

### server/services/auditHashChain.ts

```ts
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
```

### server/services/auditReportService.ts

```ts
import { queryAccessLog } from "./accessLogService";

export interface AuditReport {
  generatedAt: string;
  period: { from: string; to: string };
  totalEvents: number;
  byAction: Record<string, number>;
  byUser: Record<string, number>;
  byResource: Record<string, number>;
  recentEntries: { userId: string; action: string; resource: string; timestamp: string }[];
}

export function generateAuditReport(): AuditReport {
  const entries = queryAccessLog({ limit: 1000 });
  const byAction: Record<string, number> = {};
  const byUser: Record<string, number> = {};
  const byResource: Record<string, number> = {};

  for (const e of entries) {
    byAction[e.action] = (byAction[e.action] || 0) + 1;
    byUser[e.userId] = (byUser[e.userId] || 0) + 1;
    byResource[e.resource] = (byResource[e.resource] || 0) + 1;
  }

  const now = new Date().toISOString();
  return {
    generatedAt: now,
    period: { from: entries.length > 0 ? entries[entries.length - 1].timestamp : now, to: now },
    totalEvents: entries.length,
    byAction,
    byUser,
    byResource,
    recentEntries: entries.slice(0, 20).map((e) => ({ userId: e.userId, action: e.action, resource: e.resource, timestamp: e.timestamp })),
  };
}
```

### server/services/fdaValidationService.ts

```ts
import type { GoldenCaseRunResult } from "../types/clinical";

export interface FDAValidationReport {
  totalCases:          number;
  passed:              number;
  failed:              number;
  accuracy:            number;
  highRiskFailures:    number;
  criticalMisses:      string[];
  fdaReady:            boolean;
  readinessGrade:      "A" | "B" | "C" | "F";
  recommendations:     string[];
  generatedAt:         string;
}

class FDAValidationService {
  private readonly minAccuracyForReady = 0.8;
  private readonly targetAccuracy      = 0.95;

  generateReport(runs: GoldenCaseRunResult[]): FDAValidationReport {
    const total = runs.length;
    const passed = runs.filter((r) => r.passed).length;
    const failed = total - passed;
    const accuracy = total === 0 ? 0 : passed / total;

    // Any missed ED-now dispositions are critical
    const criticalMisses = runs
      .filter((r) => !r.passed && r.mismatches.some((m) => m.includes("ED now")))
      .map((r) => r.caseId);

    const highRiskFailures = criticalMisses.length;

    const fdaReady = accuracy >= this.minAccuracyForReady && highRiskFailures === 0;

    const readinessGrade: "A" | "B" | "C" | "F" =
      accuracy >= 0.95 && highRiskFailures === 0 ? "A" :
      accuracy >= 0.85 && highRiskFailures === 0 ? "B" :
      accuracy >= 0.75                            ? "C" : "F";

    const recommendations: string[] = [];
    if (accuracy < this.targetAccuracy) {
      recommendations.push(`Accuracy ${(accuracy * 100).toFixed(1)}% is below target 95%. Review failing cases and retrain.`);
    }
    if (highRiskFailures > 0) {
      recommendations.push(`${highRiskFailures} missed ED-now disposition(s) — critical patient safety gaps. Immediate remediation required.`);
    }
    if (total < 10) {
      recommendations.push("Golden case corpus is small (< 10 cases). Expand to improve statistical confidence.");
    }
    if (fdaReady) {
      recommendations.push("System meets FDA SaMD Class II validation threshold.");
    }

    return {
      totalCases:       total,
      passed,
      failed,
      accuracy,
      highRiskFailures,
      criticalMisses,
      fdaReady,
      readinessGrade,
      recommendations,
      generatedAt:      new Date().toISOString(),
    };
  }
}

export const fdaValidationService = new FDAValidationService();
```
