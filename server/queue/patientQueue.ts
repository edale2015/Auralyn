import { runFullClinicalFlow } from "../orchestrator/clinicalOrchestrator";

const MAX_QUEUE_DEPTH = 1000;

interface QueueJob {
  id: string;
  data: any;
  addedAt: number;
  status: "pending" | "processing" | "done" | "failed";
  result?: any;
  error?: string;
  processedAt?: number;
}

const jobStore = new Map<string, QueueJob>();
const pendingQueue: string[] = [];
let isProcessing = false;
let jobCounter = 0;

let Queue: any = null;
let Worker: any = null;
let IORedis: any = null;
let redisQueue: any = null;
let redisWorker: any = null;

async function initRedis(): Promise<boolean> {
  const redisUrl = process.env.REDIS_URL;
  // Skip ioredis/BullMQ for Upstash REST — not TCP-compatible with BullMQ
  if (!redisUrl || redisUrl.includes("upstash.io")) return false;
  try {
    const bullmq = await import("bullmq");
    const ioredis = await import("ioredis");
    Queue = bullmq.Queue;
    Worker = bullmq.Worker;
    IORedis = ioredis.default;

    const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
    redisQueue = new Queue("patients", { connection });

    redisWorker = new Worker(
      "patients",
      async (job: any) => {
        const result = await runFullClinicalFlow(job.data);
        return result;
      },
      { connection: new IORedis(redisUrl, { maxRetriesPerRequest: null }) }
    );

    console.log("[PatientQueue] Redis/BullMQ queue initialized");
    return true;
  } catch (e: any) {
    console.warn("[PatientQueue] Redis unavailable, using in-memory queue:", e?.message);
    return false;
  }
}

let redisInitialized = false;
let redisAvailable = false;

async function ensureInit() {
  if (!redisInitialized) {
    redisInitialized = true;
    redisAvailable = await initRedis();
  }
}

async function processNext(): Promise<void> {
  if (isProcessing || pendingQueue.length === 0) return;
  isProcessing = true;

  const jobId = pendingQueue.shift()!;
  const job = jobStore.get(jobId);
  if (!job) { isProcessing = false; return; }

  job.status = "processing";
  job.processedAt = Date.now();

  try {
    const result = await runFullClinicalFlow(job.data);
    job.status = "done";
    job.result = result;
  } catch (e: any) {
    job.status = "failed";
    job.error = e?.message;
  } finally {
    isProcessing = false;
    setTimeout(processNext, 0);
  }
}

export async function addPatientJob(input: any): Promise<{ jobId: string; queued: boolean; error?: string }> {
  await ensureInit();

  if (redisAvailable && redisQueue) {
    try {
      const waiting = await redisQueue.getWaitingCount();
      if (waiting >= MAX_QUEUE_DEPTH) {
        return { jobId: "", queued: false, error: "System busy — queue at capacity. Please try again shortly." };
      }
    } catch {}
  } else {
    if (pendingQueue.length >= MAX_QUEUE_DEPTH) {
      return { jobId: "", queued: false, error: "System busy — queue at capacity. Please try again shortly." };
    }
  }

  const jobId = `job_${++jobCounter}_${Date.now()}`;

  if (redisAvailable && redisQueue) {
    await redisQueue.add("new-patient", input, { jobId });
    return { jobId, queued: true };
  }

  const job: QueueJob = {
    id: jobId,
    data: input,
    addedAt: Date.now(),
    status: "pending",
  };
  jobStore.set(jobId, job);
  pendingQueue.push(jobId);

  setTimeout(processNext, 0);
  return { jobId, queued: true };
}

export async function getJobStatus(jobId: string): Promise<QueueJob | null> {
  await ensureInit();

  if (redisAvailable && redisQueue) {
    try {
      const job = await redisQueue.getJob(jobId);
      if (!job) return null;
      const state = await job.getState();
      return {
        id: jobId,
        data: job.data,
        addedAt: job.timestamp,
        status: state === "completed" ? "done" : state === "failed" ? "failed" : state === "active" ? "processing" : "pending",
        result: job.returnvalue,
        error: job.failedReason,
      };
    } catch {
      return null;
    }
  }

  return jobStore.get(jobId) ?? null;
}

export function getQueueStats() {
  const jobs = Array.from(jobStore.values());
  return {
    backend: redisAvailable ? "redis" : "in-memory",
    total: jobs.length,
    pending: jobs.filter(j => j.status === "pending").length,
    processing: jobs.filter(j => j.status === "processing").length,
    done: jobs.filter(j => j.status === "done").length,
    failed: jobs.filter(j => j.status === "failed").length,
    queueDepth: pendingQueue.length,
    maxDepth: MAX_QUEUE_DEPTH,
    atCapacity: pendingQueue.length >= MAX_QUEUE_DEPTH,
  };
}
