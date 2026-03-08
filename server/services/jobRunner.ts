export interface Job {
  id: string;
  name: string;
  status: "pending" | "running" | "completed" | "failed";
  createdAt: string;
  completedAt?: string;
  result?: unknown;
  error?: string;
}

const jobs = new Map<string, Job>();

export function createJob(name: string): Job {
  const job: Job = {
    id: `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name,
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  jobs.set(job.id, job);
  return job;
}

export function completeJob(id: string, result: unknown): void {
  const job = jobs.get(id);
  if (job) { job.status = "completed"; job.result = result; job.completedAt = new Date().toISOString(); }
}

export function failJob(id: string, error: string): void {
  const job = jobs.get(id);
  if (job) { job.status = "failed"; job.error = error; job.completedAt = new Date().toISOString(); }
}

export function getJob(id: string): Job | undefined { return jobs.get(id); }
export function listJobs(limit = 50): Job[] { return Array.from(jobs.values()).slice(-limit).reverse(); }
