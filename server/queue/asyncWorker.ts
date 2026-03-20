import { emitEvent } from "../controlTower/eventBus";

export type AsyncJobType =
  | "postProcessing"
  | "learning"
  | "rpa"
  | "snapshot"
  | "audit"
  | "notification";

export interface AsyncJob {
  type: AsyncJobType;
  payload: Record<string, any>;
  traceId?: string;
}

type JobHandler = (job: AsyncJob) => Promise<void>;

const handlers: Map<AsyncJobType, JobHandler> = new Map();
let queued = 0;
let processed = 0;
let failed = 0;

export function registerHandler(type: AsyncJobType, handler: JobHandler): void {
  handlers.set(type, handler);
}

export function queueAsyncWork(job: AsyncJob): void {
  queued++;
  setImmediate(async () => {
    const handler = handlers.get(job.type);
    if (!handler) {
      console.warn(`[AsyncWorker] No handler registered for job type: ${job.type}`);
      return;
    }
    try {
      await handler(job);
      processed++;
    } catch (e: any) {
      failed++;
      console.error(`[AsyncWorker] Job '${job.type}' (trace: ${job.traceId}) failed:`, e?.message);
      emitEvent({
        type: "ERROR",
        payload: { source: "asyncWorker", jobType: job.type, traceId: job.traceId, error: e?.message },
        timestamp: Date.now(),
      });
    }
  });
}

export function getAsyncWorkerStats() {
  return { queued, processed, failed, pending: queued - processed - failed };
}
