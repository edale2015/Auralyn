export interface RetryJob {
  id: string;
  fn: () => Promise<unknown>;
  priority: number;
  attempts: number;
  maxAttempts: number;
}

const retryQueue: RetryJob[] = [];

export function enqueueRetry(job: Omit<RetryJob, "id" | "attempts"> & { id?: string }): void {
  retryQueue.push({
    id: job.id ?? `job-${Date.now()}`,
    fn: job.fn,
    priority: job.priority ?? 1,
    attempts: 0,
    maxAttempts: job.maxAttempts ?? 3,
  });
}

export function getQueue(): RetryJob[] {
  return [...retryQueue];
}

export function clearQueue(): void {
  retryQueue.splice(0);
}

export async function processRetry(): Promise<{ processed: number; failed: number }> {
  retryQueue.sort((a, b) => b.priority - a.priority);
  let processed = 0;
  let failed = 0;
  const toRemove: string[] = [];

  for (const job of retryQueue) {
    if (job.attempts >= job.maxAttempts) {
      toRemove.push(job.id);
      failed++;
      continue;
    }
    try {
      job.attempts++;
      await job.fn();
      toRemove.push(job.id);
      processed++;
    } catch {
      if (job.attempts >= job.maxAttempts) {
        toRemove.push(job.id);
        failed++;
      }
    }
  }

  toRemove.forEach(id => {
    const idx = retryQueue.findIndex(j => j.id === id);
    if (idx !== -1) retryQueue.splice(idx, 1);
  });

  return { processed, failed };
}
