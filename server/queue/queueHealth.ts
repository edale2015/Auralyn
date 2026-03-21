import { ENV } from "../config/env";

interface QueueHealthEntry {
  ok: boolean;
  waiting?: number;
  active?: number;
  failed?: number;
  error?: string;
}

export async function getAllQueueHealth(): Promise<Record<string, QueueHealthEntry>> {
  if (!ENV.REDIS_URL) {
    return { status: { ok: false, error: "REDIS_URL not configured — using in-memory queues" } };
  }

  try {
    const { Queue } = await import("bullmq");
    const IORedis = (await import("ioredis")).default;
    const conn = new IORedis(ENV.REDIS_URL, { maxRetriesPerRequest: 1, lazyConnect: true });
    await conn.connect().catch(() => { throw new Error("Redis ping failed"); });

    const queueNames = ["post", "rpa", "learning"];
    const result: Record<string, QueueHealthEntry> = {};

    for (const name of queueNames) {
      try {
        const q = new Queue(name, { connection: conn });
        const [waiting, active, failed] = await Promise.all([
          q.getWaitingCount(),
          q.getActiveCount(),
          q.getFailedCount(),
        ]);
        await q.close();
        result[name] = { ok: true, waiting, active, failed };
      } catch (err: any) {
        result[name] = { ok: false, error: err?.message || "Queue unavailable" };
      }
    }

    await conn.disconnect();
    return result;
  } catch (err: any) {
    return { status: { ok: false, error: err?.message || "Queue health check failed" } };
  }
}
