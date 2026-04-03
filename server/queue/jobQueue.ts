import { Queue, Job as BullJob } from 'bullmq';
import crypto from 'node:crypto';
import { createDurableQueue } from './queueFactory';

export type JobStatus = 'pending' | 'running' | 'completed' | 'failed';

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

const memoryJobs: Map<string, Job> = new Map();
const handlers: Map<string, JobHandler> = new Map();
const durableQueues: Map<string, Queue<any>> = new Map();

function makeId(): string {
  return `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function buildIdempotencyKey(name: string, data: unknown): string {
  return crypto.createHash('sha256').update(`${name}:${JSON.stringify(data)}`).digest('hex');
}

function toMemoryJob<T>(name: string, data: T, id: string, options: { attempts?: number }): Job<T> {
  return {
    id,
    name,
    data,
    status: 'pending',
    attempts: 0,
    maxAttempts: options.attempts ?? 3,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function registerHandler(name: string, handler: JobHandler): void {
  handlers.set(name, handler);
  if (!durableQueues.has(name)) {
    const durable = createDurableQueue<any>({
      name,
      processor: async (job) => {
        const runtime: Job = {
          id: job.id ?? makeId(),
          name,
          data: job.data,
          status: 'running',
          attempts: job.attemptsStarted,
          maxAttempts: job.opts.attempts ?? 3,
          createdAt: job.timestamp,
          updatedAt: Date.now(),
        };
        return handler(runtime);
      },
    });
    if (durable.queue) durableQueues.set(name, durable.queue);
  }
}

export async function addJob<T = unknown>(
  name: string,
  data: T,
  options: { attempts?: number; backoffMs?: number } = {},
): Promise<Job<T>> {
  const id = buildIdempotencyKey(name, data);
  const durable = durableQueues.get(name);
  if (durable) {
    const existing = await durable.getJob(id);
    if (!existing) {
      await durable.add(name, data, {
        jobId: id,
        attempts: options.attempts ?? 3,
        backoff: { type: 'exponential', delay: options.backoffMs ?? 1000 },
      });
    }
    return {
      id,
      name,
      data,
      status: 'pending',
      attempts: 0,
      maxAttempts: options.attempts ?? 3,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  const job = toMemoryJob(name, data, id, options);
  memoryJobs.set(job.id, job as Job);
  runMemoryJob(job as Job, options.backoffMs ?? 1000).catch(() => {});
  return job;
}

async function runMemoryJob(job: Job, backoffMs: number): Promise<void> {
  const handler = handlers.get(job.name);
  if (!handler) {
    job.status = 'failed';
    job.error = `No handler registered for job "${job.name}"`;
    job.updatedAt = Date.now();
    return;
  }
  while (job.attempts < job.maxAttempts) {
    job.attempts += 1;
    job.status = 'running';
    job.updatedAt = Date.now();
    try {
      job.result = await handler(job);
      job.status = 'completed';
      job.updatedAt = Date.now();
      return;
    } catch (e: any) {
      job.error = e?.message ?? String(e);
      job.updatedAt = Date.now();
      if (job.attempts < job.maxAttempts) {
        const delay = backoffMs * Math.pow(2, job.attempts - 1);
        await new Promise((res) => setTimeout(res, delay));
      }
    }
  }
  job.status = 'failed';
  job.updatedAt = Date.now();
}

function mapBullState(state: string): JobStatus {
  if (state === 'completed') return 'completed';
  if (state === 'failed') return 'failed';
  if (state === 'active') return 'running';
  return 'pending';
}

async function fromBullJob(job: BullJob | undefined, nameHint?: string): Promise<Job | undefined> {
  if (!job) return undefined;
  const state = await job.getState();
  return {
    id: job.id ?? '',
    name: nameHint ?? job.name,
    data: job.data,
    status: mapBullState(state),
    attempts: job.attemptsStarted,
    maxAttempts: job.opts.attempts ?? 3,
    createdAt: job.timestamp,
    updatedAt: job.processedOn ?? job.timestamp,
    result: job.returnvalue,
    error: job.failedReason,
  };
}

export async function getJob(id: string): Promise<Job | undefined> {
  for (const [name, queue] of durableQueues.entries()) {
    const found = await fromBullJob(await queue.getJob(id), name);
    if (found) return found;
  }
  return memoryJobs.get(id);
}

export async function listJobs(name?: string): Promise<Job[]> {
  const out: Job[] = [];
  for (const [queueName, queue] of durableQueues.entries()) {
    if (name && name !== queueName) continue;
    const jobs = await queue.getJobs(['waiting', 'active', 'completed', 'failed', 'delayed']);
    for (const job of jobs) {
      const mapped = await fromBullJob(job, queueName);
      if (mapped) out.push(mapped);
    }
  }
  const mem = Array.from(memoryJobs.values()).filter((j) => !name || j.name === name);
  return [...out, ...mem].sort((a, b) => b.createdAt - a.createdAt);
}
