export type JobStatus = "pending" | "running" | "completed" | "failed";

export interface Job<T = unknown> {
  id: string;
  name: string;
  data: T;
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  createdAt: number;
  updatedAt: number;
  result?: unknown;
  error?: string;
}

export type JobHandler<T = unknown> = (job: Job<T>) => Promise<unknown>;

const jobs: Map<string, Job> = new Map();
const handlers: Map<string, JobHandler> = new Map();

function makeId(): string {
  return `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function registerHandler(name: string, handler: JobHandler): void {
  handlers.set(name, handler);
}

export async function addJob<T = unknown>(
  name: string,
  data: T,
  options: { attempts?: number; backoffMs?: number } = {}
): Promise<Job<T>> {
  const job: Job<T> = {
    id: makeId(),
    name,
    data,
    status: "pending",
    attempts: 0,
    maxAttempts: options.attempts ?? 3,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  jobs.set(job.id, job as Job);
  console.log(`[JobQueue] Added job "${name}" id=${job.id}`);

  runJob(job as Job, options.backoffMs ?? 1000).catch(() => {});

  return job;
}

async function runJob(job: Job, backoffMs: number): Promise<void> {
  const handler = handlers.get(job.name);
  if (!handler) {
    job.status = "failed";
    job.error = `No handler registered for job "${job.name}"`;
    job.updatedAt = Date.now();
    console.error(`[JobQueue] ${job.error}`);
    return;
  }

  while (job.attempts < job.maxAttempts) {
    job.attempts += 1;
    job.status = "running";
    job.updatedAt = Date.now();

    try {
      job.result = await handler(job);
      job.status = "completed";
      job.updatedAt = Date.now();
      console.log(`[JobQueue] Job "${job.name}" id=${job.id} completed on attempt ${job.attempts}`);
      return;
    } catch (e: any) {
      job.error = e?.message ?? String(e);
      job.updatedAt = Date.now();
      console.warn(
        `[JobQueue] Job "${job.name}" id=${job.id} attempt ${job.attempts}/${job.maxAttempts} failed: ${job.error}`
      );

      if (job.attempts < job.maxAttempts) {
        const delay = backoffMs * Math.pow(2, job.attempts - 1);
        await new Promise((res) => setTimeout(res, delay));
      }
    }
  }

  job.status = "failed";
  job.updatedAt = Date.now();
  console.error(
    `[JobQueue] Job "${job.name}" id=${job.id} permanently failed after ${job.maxAttempts} attempts`
  );
}

export function getJob(id: string): Job | undefined {
  return jobs.get(id);
}

export function listJobs(name?: string): Job[] {
  const all = Array.from(jobs.values());
  return name ? all.filter((j) => j.name === name) : all;
}
