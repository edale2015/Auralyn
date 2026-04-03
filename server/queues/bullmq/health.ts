import { getQueueMap } from "./queueFactory";
import { isBullAvailable } from "./connection";
import { logger } from "../../utils/logger";

export interface QueueHealthEntry {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

export interface QueuesHealth {
  available: boolean;
  queues: QueueHealthEntry[];
  checkedAt: string;
}

export async function getQueuesHealth(): Promise<QueuesHealth> {
  if (!isBullAvailable()) {
    return { available: false, queues: [], checkedAt: new Date().toISOString() };
  }

  const map = getQueueMap();
  const entries: QueueHealthEntry[] = [];

  for (const [name, q] of map.entries()) {
    try {
      const counts = await q.getJobCounts("waiting", "active", "completed", "failed", "delayed");
      entries.push({
        name,
        waiting: counts.waiting ?? 0,
        active: counts.active ?? 0,
        completed: counts.completed ?? 0,
        failed: counts.failed ?? 0,
        delayed: counts.delayed ?? 0,
      });
    } catch (e: any) {
      logger.warn(`[QueueHealth] Failed to get counts for ${name}`, { message: e?.message });
      entries.push({ name, waiting: -1, active: -1, completed: -1, failed: -1, delayed: -1 });
    }
  }

  return { available: true, queues: entries, checkedAt: new Date().toISOString() };
}
