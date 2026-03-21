import { appendSystemEvent } from "../repos/systemEventRepo";

export async function onWorkerStarted(workerName: string): Promise<void> {
  await appendSystemEvent({
    eventName: "worker.started",
    severity: "info",
    source: workerName
  });
}

export async function onWorkerJobCompleted(workerName: string, jobId: string): Promise<void> {
  await appendSystemEvent({
    eventName: "worker.job.completed",
    severity: "info",
    source: workerName,
    payload: { jobId }
  });
}

export async function onWorkerJobFailed(workerName: string, jobId: string, err: unknown): Promise<void> {
  const message = err instanceof Error ? err.message : String(err);
  await appendSystemEvent({
    eventName: "worker.job.failed",
    severity: "error",
    source: workerName,
    payload: { jobId, error: message }
  });
}
