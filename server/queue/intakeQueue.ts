import { runAutonomousAgents, type AutonomousResult } from "../pipeline/autonomousAgents";
import type { AgentContext } from "../agents/orchestrator";
import { publish } from "../agents/eventBus";

export type JobStatus = "queued" | "processing" | "completed" | "failed";

export interface QueueJob {
  id: string;
  data: AgentContext;
  status: JobStatus;
  queuedAt: string;
  startedAt?: string;
  completedAt?: string;
  result?: AutonomousResult;
  error?: string;
  retries: number;
  priority: number;
}

interface QueueConfig {
  concurrency: number;
  maxRetries: number;
  maxQueueSize: number;
  processingTimeoutMs: number;
}

const DEFAULT_CONFIG: QueueConfig = {
  concurrency: 50,
  maxRetries: 2,
  maxQueueSize: 10000,
  processingTimeoutMs: 30000,
};

let config = { ...DEFAULT_CONFIG };
const queue: QueueJob[] = [];
const completedJobs: QueueJob[] = [];
let activeWorkers = 0;
let jobCounter = 0;
let totalProcessed = 0;
let totalFailed = 0;
let totalProcessingMs = 0;
let isRunning = true;

function generateJobId(): string {
  return `JOB-${Date.now()}-${String(++jobCounter).padStart(5, "0")}`;
}

export function enqueue(
  data: AgentContext,
  opts?: { priority?: number },
): { jobId: string; position: number } | { error: string } {
  if (queue.length >= config.maxQueueSize) {
    return { error: `Queue full (max ${config.maxQueueSize})` };
  }

  const job: QueueJob = {
    id: generateJobId(),
    data,
    status: "queued",
    queuedAt: new Date().toISOString(),
    retries: 0,
    priority: opts?.priority ?? 0,
  };

  queue.push(job);
  queue.sort((a, b) => b.priority - a.priority);

  publish("queue:enqueued", { jobId: job.id, queueLength: queue.length });

  processNext();

  return { jobId: job.id, position: queue.filter((j) => j.status === "queued").length };
}

export function enqueueBatch(
  cases: Array<{ data: AgentContext; priority?: number }>,
): Array<{ jobId: string; position: number } | { error: string }> {
  return cases.map((c) => enqueue(c.data, { priority: c.priority }));
}

async function processJob(job: QueueJob) {
  job.status = "processing";
  job.startedAt = new Date().toISOString();
  activeWorkers++;

  try {
    const result = await runAutonomousAgents(job.data);
    job.status = "completed";
    job.completedAt = new Date().toISOString();
    job.result = result;
    totalProcessed++;

    const durationMs = new Date(job.completedAt).getTime() - new Date(job.startedAt!).getTime();
    totalProcessingMs += durationMs;

    publish("queue:completed", { jobId: job.id, durationMs, priority: result.decision.priority });
  } catch (err: any) {
    if (job.retries < config.maxRetries) {
      job.retries++;
      job.status = "queued";
      job.startedAt = undefined;
      queue.push(job);
      publish("queue:retry", { jobId: job.id, attempt: job.retries });
    } else {
      job.status = "failed";
      job.completedAt = new Date().toISOString();
      job.error = err.message || "Unknown processing error";
      totalFailed++;
      publish("queue:failed", { jobId: job.id, error: job.error });
    }
  } finally {
    activeWorkers--;

    const idx = queue.indexOf(job);
    if (idx >= 0 && job.status !== "queued") queue.splice(idx, 1);

    if (job.status === "completed" || job.status === "failed") {
      completedJobs.push(job);
      if (completedJobs.length > 500) completedJobs.splice(0, completedJobs.length - 500);
    }

    processNext();
  }
}

function processNext() {
  if (!isRunning) return;

  while (activeWorkers < config.concurrency) {
    const next = queue.find((j) => j.status === "queued");
    if (!next) break;
    processJob(next);
  }
}

export function getJobStatus(jobId: string): QueueJob | undefined {
  return queue.find((j) => j.id === jobId) || completedJobs.find((j) => j.id === jobId);
}

export function getQueueStats() {
  const queued = queue.filter((j) => j.status === "queued").length;
  const processing = queue.filter((j) => j.status === "processing").length;
  return {
    queued,
    processing,
    activeWorkers,
    totalProcessed,
    totalFailed,
    avgProcessingMs: totalProcessed > 0 ? Math.round(totalProcessingMs / totalProcessed) : 0,
    throughputPerHour: totalProcessed > 0
      ? Math.round(totalProcessed / ((Date.now() - new Date(completedJobs[0]?.queuedAt || Date.now()).getTime()) / 3600000) || 0)
      : 0,
    config,
    isRunning,
  };
}

export function getRecentJobs(limit = 50): Array<{
  id: string;
  status: JobStatus;
  patientId?: string;
  priority: number;
  queuedAt: string;
  durationMs?: number;
  decision?: string;
}> {
  const all = [...queue, ...completedJobs].sort(
    (a, b) => new Date(b.queuedAt).getTime() - new Date(a.queuedAt).getTime(),
  );
  return all.slice(0, limit).map((j) => ({
    id: j.id,
    status: j.status,
    patientId: j.data.patientId,
    priority: j.priority,
    queuedAt: j.queuedAt,
    durationMs:
      j.startedAt && j.completedAt
        ? new Date(j.completedAt).getTime() - new Date(j.startedAt).getTime()
        : undefined,
    decision: j.result?.decision.priority,
  }));
}

export function updateQueueConfig(updates: Partial<QueueConfig>) {
  if (updates.concurrency !== undefined) config.concurrency = Math.max(1, Math.min(200, updates.concurrency));
  if (updates.maxRetries !== undefined) config.maxRetries = Math.max(0, Math.min(5, updates.maxRetries));
  if (updates.maxQueueSize !== undefined) config.maxQueueSize = Math.max(100, Math.min(100000, updates.maxQueueSize));
  if (updates.processingTimeoutMs !== undefined) config.processingTimeoutMs = Math.max(5000, updates.processingTimeoutMs);
  return config;
}

export function pauseQueue() {
  isRunning = false;
  publish("queue:paused", { timestamp: new Date().toISOString() });
}

export function resumeQueue() {
  isRunning = true;
  publish("queue:resumed", { timestamp: new Date().toISOString() });
  processNext();
}

export function drainQueue(): number {
  const drained = queue.filter((j) => j.status === "queued").length;
  for (let i = queue.length - 1; i >= 0; i--) {
    if (queue[i].status === "queued") queue.splice(i, 1);
  }
  publish("queue:drained", { count: drained });
  return drained;
}
