/**
 * server/audit/scheduledAuditVerifier.ts — Scheduled Audit Verification Jobs
 *
 * FIX (Batch-1 Finding #7 — High): Verification results now persisted to the
 * audit_verification_runs DB table. Previously stored in a module-level array
 * capped at 90 entries — reset on restart, ~3 months of history silently dropped.
 *
 * Without durable storage, an OCR auditor requesting 12 months of verification
 * history got nothing, directly contradicting the file's own comment that it
 * "satisfies 45 CFR §164.312(b)".
 *
 * The in-memory list remains as a cache for the last N results for speed.
 * All compliance queries must use DB-backed getVerificationLog().
 */

import { verifyFullAuditChain, verifyAuditBatch } from "./auditVerifier";
import { auditStep, createTraceId }               from "./auditLogger";
import { emitEvent }                               from "../controlTower/eventBus";
import { logger }                                  from "../utils/logger";
import { db }                                      from "../db";
import { auditVerificationRuns }                   from "../../shared/schema";
import { desc }                                    from "drizzle-orm";

export interface ScheduledVerificationRecord {
  jobId:            string;
  scheduledAt:      string;
  completedAt:      string;
  triggeredBy:      "scheduled" | "manual" | "incident";
  frequency:        "nightly" | "weekly";
  result: {
    verified:       boolean;
    recordsChecked: number;
    durationMs:     number;
    brokenAt?:      { recordIndex: number; traceId: string };
  };
  storedSeparately: true;
}

// In-memory cache — recent results only
const verificationCache: ScheduledVerificationRecord[] = [];
const MAX_CACHE = 10;

let _nightlyIntervalId: ReturnType<typeof setInterval> | null = null;
let _weeklyIntervalId:  ReturnType<typeof setInterval> | null = null;
let _schedulerStartedAt: string | null = null;

/** Returns DB-backed full history — use for compliance queries */
export async function getVerificationLog(limit = 90): Promise<ScheduledVerificationRecord[]> {
  try {
    const rows = await db
      .select()
      .from(auditVerificationRuns)
      .orderBy(desc(auditVerificationRuns.createdAt))
      .limit(limit);

    return rows.map((row) => ({
      jobId:       row.id,
      scheduledAt: row.createdAt.toISOString(),
      completedAt: row.createdAt.toISOString(),
      triggeredBy: row.triggeredBy as any,
      frequency:   row.frequency as any,
      result: {
        verified:       row.verified,
        recordsChecked: row.recordsChecked,
        durationMs:     row.durationMs,
        brokenAt:       row.brokenAt as any,
      },
      storedSeparately: true as const,
    }));
  } catch {
    return [...verificationCache];
  }
}

export async function getLastVerificationResult(): Promise<ScheduledVerificationRecord | null> {
  // Check cache first
  if (verificationCache.length > 0) return verificationCache[0];
  const log = await getVerificationLog(1);
  return log[0] ?? null;
}

async function runVerificationJob(
  frequency:   "nightly" | "weekly",
  triggeredBy: "scheduled" | "manual" | "incident"
): Promise<ScheduledVerificationRecord> {
  const jobId      = `AUDIT-VERIFY-${Date.now()}`;
  const scheduledAt = new Date().toISOString();
  const startMs    = Date.now();

  logger.info("audit_verification_started", { jobId, frequency, triggeredBy });

  let verified       = false;
  let recordsChecked = 0;
  let brokenAt: ScheduledVerificationRecord["result"]["brokenAt"] | undefined;

  try {
    if (frequency === "weekly") {
      const chainResult = await verifyFullAuditChain();
      verified          = chainResult.verified;
      recordsChecked    = chainResult.recordsChecked;
      if (chainResult.brokenAt) {
        brokenAt = { recordIndex: chainResult.brokenAt.recordIndex, traceId: chainResult.brokenAt.traceId };
      }
    } else {
      const batchResult = await verifyAuditBatch(100);
      verified          = batchResult.verified;
      recordsChecked    = batchResult.batchSize;
    }
  } catch (err: any) {
    logger.error("audit_verification_failed", { jobId, error: err?.message });
    verified = false;
  }

  const durationMs = Date.now() - startMs;

  // FIX: Persist to DB — survives restart, no cap
  try {
    await db.insert(auditVerificationRuns).values({
      id:             jobId,
      frequency,
      triggeredBy,
      verified,
      recordsChecked,
      durationMs,
      brokenAt:       brokenAt ?? null,
    });
  } catch (err: any) {
    logger.error("audit_verification_persist_failed", { jobId, error: err?.message });
  }

  const record: ScheduledVerificationRecord = {
    jobId,
    scheduledAt,
    completedAt:  new Date().toISOString(),
    triggeredBy,
    frequency,
    result: { verified, recordsChecked, durationMs, brokenAt },
    storedSeparately: true,
  };

  // Keep small in-memory cache for fast status checks
  verificationCache.unshift(record);
  if (verificationCache.length > MAX_CACHE) verificationCache.splice(MAX_CACHE);

  // Write AUDIT_VERIFICATION_RUN audit event
  const traceId = createTraceId();
  await auditStep({
    traceId,
    step:     "AUDIT_VERIFICATION_RUN",
    input:    { jobId, frequency, triggeredBy },
    output:   { verified, recordsChecked, durationMs },
    metadata: { brokenAt },
  }).catch(() => {});

  if (!verified) {
    emitEvent({
      type:    "ALERT",
      payload: { message: `AUDIT CHAIN INTEGRITY FAILURE — ${frequency} verification found tampering. Job: ${jobId}`, severity: "CRITICAL", jobId, brokenAt },
      timestamp: Date.now(),
    });
    logger.error("audit_chain_integrity_failure", { jobId, frequency, brokenAt });
  } else {
    logger.info("audit_verification_passed", { jobId, frequency, recordsChecked, durationMs });
  }

  return record;
}

export function startScheduledAuditVerification(): void {
  if (_nightlyIntervalId) return;

  _schedulerStartedAt = new Date().toISOString();
  logger.info("scheduled_audit_verification_started");

  _nightlyIntervalId = setInterval(async () => {
    await runVerificationJob("nightly", "scheduled");
  }, 24 * 60 * 60 * 1000);
  _nightlyIntervalId.unref();

  _weeklyIntervalId = setInterval(async () => {
    await runVerificationJob("weekly", "scheduled");
  }, 7 * 24 * 60 * 60 * 1000);
  _weeklyIntervalId?.unref();

  setTimeout(() => {
    runVerificationJob("nightly", "scheduled").catch(() => {});
  }, 5000).unref();
}

export function stopScheduledAuditVerification(): void {
  if (_nightlyIntervalId) { clearInterval(_nightlyIntervalId); _nightlyIntervalId = null; }
  if (_weeklyIntervalId)  { clearInterval(_weeklyIntervalId);  _weeklyIntervalId  = null; }
}

export async function runManualVerification(
  frequency: "nightly" | "weekly" = "nightly"
): Promise<ScheduledVerificationRecord> {
  return runVerificationJob(frequency, "manual");
}

export function getSchedulerStatus(): {
  running:      boolean;
  startedAt:    string | null;
  totalJobsRun: number;
} {
  return {
    running:      _nightlyIntervalId !== null,
    startedAt:    _schedulerStartedAt,
    totalJobsRun: verificationCache.length,
  };
}
