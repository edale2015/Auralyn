import { Queue } from "bullmq";
import { getBullConnection, isBullAvailable } from "./connection";
import { defaultJobOptions } from "./defaultJobOptions";
import { ALL_QUEUE_NAMES, type QueueName } from "./queueNames";
import { logger } from "../../utils/logger";

const _queues = new Map<string, Queue>();

export function getQueue(name: QueueName): Queue | null {
  if (!isBullAvailable()) return null;

  if (_queues.has(name)) return _queues.get(name)!;

  try {
    const connection = getBullConnection();
    if (!connection) return null;

    const q = new Queue(name, {
      connection,
      defaultJobOptions,
    });
    _queues.set(name, q);
    return q;
  } catch (e: any) {
    logger.warn(`[QueueFactory] Failed to create queue: ${name}`, { message: e?.message });
    return null;
  }
}

export async function closeAllQueues(): Promise<void> {
  const closes = Array.from(_queues.values()).map((q) =>
    q.close().catch((e) => logger.warn("[QueueFactory] Queue close error", { message: e?.message }))
  );
  await Promise.all(closes);
  _queues.clear();
}

export function getQueueMap(): Map<string, Queue> {
  return _queues;
}

export function initAllQueues(): void {
  if (!isBullAvailable()) {
    logger.info("[QueueFactory] Redis unavailable — skipping queue init");
    return;
  }
  for (const name of ALL_QUEUE_NAMES) {
    getQueue(name);
  }
  logger.info(`[QueueFactory] Initialized ${ALL_QUEUE_NAMES.length} queues`);
}
