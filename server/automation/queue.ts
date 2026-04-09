/**
 * Automation Job Queue — lightweight in-process async queue
 *
 * Uses a simple concurrency-controlled promise chain (no BullMQ/ioredis
 * dependency) consistent with the project's existing in-memory queue pattern.
 *
 * Concurrency: up to CONCURRENCY jobs run in parallel.
 * Failed jobs are not retried — callers decide retry policy.
 * All job outcomes are published to automationMetrics.
 *
 * For distributed deployments: replace the in-memory pool with a BullMQ
 * Queue that targets REDIS_URL (both are already available as env vars).
 */

import { recordRun, getFailureRate } from "./metricsTracker";
import type { AutomationEvent } from "./events";

const CONCURRENCY = 5;

export interface AutomationJob {
  id:          string;
  templateKey: string;
  payload:     Record<string, unknown>;
  traceId:     string;
  patientId?:  string;
  clinicId?:   string;
  enqueuedAt:  string;
}

export interface JobResult {
  jobId:       string;
  templateKey: string;
  ok:          boolean;
  result?:     unknown;
  error?:      string;
  durationMs:  number;
  healedCount: number;
  traceId:     string;
}

// ── Concurrency pool ──────────────────────────────────────────────────────────

let _running = 0;
const _pending: (() => Promise<void>)[] = [];
const _resultListeners: ((r: JobResult) => void)[] = [];

function drain() {
  while (_running < CONCURRENCY && _pending.length > 0) {
    const task = _pending.shift()!;
    _running++;
    task().finally(() => {
      _running--;
      drain();
    });
  }
}

// ── Job processor ─────────────────────────────────────────────────────────────

async function processJob(
  job: AutomationJob,
  handler: (j: AutomationJob) => Promise<{ ok: boolean; result?: unknown; error?: string; healedCount?: number }>
): Promise<JobResult> {
  const start = Date.now();
  let jobResult: JobResult;
  try {
    const r = await handler(job);
    const durationMs  = Date.now() - start;
    const healedCount = r.healedCount ?? 0;
    jobResult = { jobId: job.id, templateKey: job.templateKey, ok: r.ok, result: r.result, error: r.error, durationMs, healedCount, traceId: job.traceId };
    recordRun({ templateKey: job.templateKey, success: r.ok, durationMs, healedCount });
  } catch (err: any) {
    const durationMs = Date.now() - start;
    jobResult = { jobId: job.id, templateKey: job.templateKey, ok: false, error: err?.message ?? "unknown", durationMs, healedCount: 0, traceId: job.traceId };
    recordRun({ templateKey: job.templateKey, success: false, durationMs });
  }
  for (const l of _resultListeners) l(jobResult);
  return jobResult;
}

// ── Public API ────────────────────────────────────────────────────────────────

export type JobHandler = (job: AutomationJob) => Promise<{ ok: boolean; result?: unknown; error?: string; healedCount?: number }>;

let _defaultHandler: JobHandler | null = null;

/**
 * Register the handler that processes automation jobs.
 * Usually called once at startup from templateRunner.ts.
 */
export function registerJobHandler(handler: JobHandler): void {
  _defaultHandler = handler;
}

/**
 * Enqueue an automation job. Returns a Promise that resolves when the job
 * completes (or rejects only if the queue itself is misconfigured).
 */
export function enqueueJob(job: AutomationJob): Promise<JobResult> {
  if (!_defaultHandler) {
    return Promise.resolve({
      jobId: job.id, templateKey: job.templateKey, ok: false,
      error: "No job handler registered", durationMs: 0, healedCount: 0, traceId: job.traceId,
    });
  }

  const handler = _defaultHandler;
  return new Promise((resolve) => {
    _pending.push(async () => {
      const result = await processJob(job, handler);
      resolve(result);
    });
    drain();
  });
}

/** Fire-and-forget automation job (side-channel from clinical pipeline). */
export function fireAndForget(job: Omit<AutomationJob, "id" | "enqueuedAt">): void {
  const full: AutomationJob = {
    ...job,
    id:         `job-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    enqueuedAt: new Date().toISOString(),
  };
  enqueueJob(full).catch((err) =>
    console.warn(`[automationQueue] fire-and-forget error for ${job.templateKey}:`, err)
  );
}

/** Subscribe to job result events (used by oversight monitor). */
export function onJobResult(listener: (r: JobResult) => void): void {
  _resultListeners.push(listener);
}

/** Current queue state snapshot (for metrics endpoint). */
export function getQueueState(): { running: number; pending: number; failureRate: number } {
  return { running: _running, pending: _pending.length, failureRate: getFailureRate() };
}
