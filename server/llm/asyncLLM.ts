import { logEvent } from "../ops/auditEvents";

export type LLMJobStatus = "QUEUED" | "PROCESSING" | "COMPLETE" | "FAILED" | "TIMEOUT";

export interface LLMJob {
  jobId: string;
  type: "explanation" | "summarize" | "differential" | "note_gen";
  payload: any;
  status: LLMJobStatus;
  result?: any;
  queuedAt: string;
  completedAt?: string;
  durationMs?: number;
}

const jobQueue: LLMJob[] = [];
const jobMap = new Map<string, LLMJob>();

export function enqueueExplanation(payload: any): { jobId: string; status: "QUEUED"; message: string } {
  const jobId = `LLM-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const job: LLMJob = {
    jobId,
    type: "explanation",
    payload,
    status: "QUEUED",
    queuedAt: new Date().toISOString(),
  };
  jobQueue.push(job);
  jobMap.set(jobId, job);

  logEvent({ type: "LLM_JOB_QUEUED" as any, encounterId: jobId, detail: JSON.stringify({ payloadKeys: Object.keys(payload) }) });

  setImmediate(() => processJob(jobId));

  return { jobId, status: "QUEUED", message: "LLM processing async — off critical path" };
}

async function processJob(jobId: string): Promise<void> {
  const job = jobMap.get(jobId);
  if (!job) return;

  job.status = "PROCESSING";
  const start = Date.now();

  try {
    await new Promise<void>((resolve) => setTimeout(resolve, 50 + Math.random() * 100));

    job.result = {
      explanation: `[Async LLM] Clinical reasoning for ${job.payload?.diagnosis ?? "presented symptoms"}: differential includes ${job.payload?.symptoms?.join(", ") ?? "N/A"}.`,
      confidence: +(0.7 + Math.random() * 0.25).toFixed(3),
      generatedAt: new Date().toISOString(),
    };
    job.status = "COMPLETE";
    job.completedAt = new Date().toISOString();
    job.durationMs = Date.now() - start;
  } catch {
    job.status = "FAILED";
    job.completedAt = new Date().toISOString();
    job.durationMs = Date.now() - start;
  }
}

export function getJobStatus(jobId: string): LLMJob | null {
  return jobMap.get(jobId) ?? null;
}

export function getAsyncLLMStats() {
  const all = Array.from(jobMap.values());
  return {
    active: true,
    total: all.length,
    queued: all.filter((j) => j.status === "QUEUED").length,
    processing: all.filter((j) => j.status === "PROCESSING").length,
    complete: all.filter((j) => j.status === "COMPLETE").length,
    failed: all.filter((j) => j.status === "FAILED").length,
    avgDurationMs: all.filter((j) => j.durationMs).length > 0
      ? +(all.reduce((s, j) => s + (j.durationMs ?? 0), 0) / all.filter((j) => j.durationMs).length).toFixed(1)
      : 0,
  };
}
