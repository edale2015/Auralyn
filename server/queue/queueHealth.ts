import { getQueueDepths } from "./queues";

interface QueueHealthEntry {
  ok: boolean;
  waiting?: number;
  active?: number;
  failed?: number;
  error?: string;
  backend?: string;
}

export async function getAllQueueHealth(): Promise<Record<string, QueueHealthEntry>> {
  try {
    const depths = await getQueueDepths();
    const backend = (depths as any).backend ?? "in-memory";

    return {
      post:     { ok: true, waiting: depths.post    ?? 0, active: 0, failed: 0, backend },
      rpa:      { ok: true, waiting: depths.rpa     ?? 0, active: 0, failed: 0, backend },
      learning: { ok: true, waiting: depths.learning ?? 0, active: 0, failed: 0, backend },
      status:   { ok: true, backend } as any,
    };
  } catch (err: any) {
    return { status: { ok: false, error: err?.message || "Queue health check failed" } };
  }
}
