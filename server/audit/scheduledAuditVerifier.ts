/**
 * DOMAIN 2 — Claude Rec: Scheduled Audit Verification Jobs
 *
 * The Merkle approach satisfies 45 CFR §164.312(b) ONLY if:
 *   1. Verification runs on a schedule (not just on-demand)
 *   2. Verification results are stored separately from verified records
 *
 * This module implements both requirements.
 * Schedule: nightly batch verification + weekly full chain verification.
 *
 * Verification results are stored in-memory with their own log (separate
 * from the audit records being verified — prevents tamper cover-up).
 */

import { verifyFullAuditChain, verifyAuditBatch } from "./auditVerifier";
import { auditStep, createTraceId }               from "./auditLogger";
import { emitEvent }                               from "../controlTower/eventBus";
import { logger }                                  from "../utils/logger";

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
  storedSeparately: true;   // This record lives outside the main audit chain
}

// Separate verification log — NOT part of the audit chain being verified
const verificationLog: ScheduledVerificationRecord[] = [];
const MAX_VERIFICATION_LOG = 90;   // 90 days of records

let _nightlyIntervalId: ReturnType<typeof setInterval> | null = null;
let _weeklyIntervalId:  ReturnType<typeof setInterval> | null = null;
let _schedulerStartedAt: string | null = null;

export function getVerificationLog(): ScheduledVerificationRecord[] {
  return [...verificationLog];
}

export function getLastVerificationResult(): ScheduledVerificationRecord | null {
  return verificationLog.at(-1) ?? null;
}

async function runVerificationJob(
  frequency: "nightly" | "weekly",
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

  const completedAt = new Date().toISOString();
  const durationMs  = Date.now() - startMs;

  const record: ScheduledVerificationRecord = {
    jobId,
    scheduledAt,
    completedAt,
    triggeredBy,
    frequency,
    result: { verified, recordsChecked, durationMs, brokenAt },
    storedSeparately: true,
  };

  verificationLog.push(record);
  if (verificationLog.length > MAX_VERIFICATION_LOG) verificationLog.shift();

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

/**
 * Start scheduled verification jobs.
 * Nightly (every 24h): batch verification of last 100 records
 * Weekly (every 7d): full chain verification of all records
 *
 * Call once at server startup. Safe to call multiple times (idempotent).
 */
export function startScheduledAuditVerification(): void {
  if (_nightlyIntervalId) return;  // Already running

  _schedulerStartedAt = new Date().toISOString();
  logger.info("scheduled_audit_verification_started");

  // Nightly batch — every 24h
  _nightlyIntervalId = setInterval(async () => {
    await runVerificationJob("nightly", "scheduled");
  }, 24 * 60 * 60 * 1000);
  _nightlyIntervalId.unref();

  // Weekly full chain — every 7d
  _weeklyIntervalId = setInterval(async () => {
    await runVerificationJob("weekly", "scheduled");
  }, 7 * 24 * 60 * 60 * 1000);
  _weeklyIntervalId?.unref();

  // Run an immediate batch on startup so there's always a recent result
  setTimeout(() => {
    runVerificationJob("nightly", "scheduled").catch(() => {});
  }, 5000).unref();
}

export function stopScheduledAuditVerification(): void {
  if (_nightlyIntervalId) { clearInterval(_nightlyIntervalId); _nightlyIntervalId = null; }
  if (_weeklyIntervalId)  { clearInterval(_weeklyIntervalId);  _weeklyIntervalId  = null; }
}

/** Manually trigger a verification job (e.g., from an API endpoint or incident response). */
export async function runManualVerification(frequency: "nightly" | "weekly" = "nightly"): Promise<ScheduledVerificationRecord> {
  return runVerificationJob(frequency, "manual");
}

export function getSchedulerStatus(): {
  running:    boolean;
  startedAt:  string | null;
  lastResult: ScheduledVerificationRecord | null;
  totalJobsRun: number;
} {
  return {
    running:      _nightlyIntervalId !== null,
    startedAt:    _schedulerStartedAt,
    lastResult:   getLastVerificationResult(),
    totalJobsRun: verificationLog.length,
  };
}
