import { closeAllQueues } from "./queueFactory";
import { logger } from "../../utils/logger";

const _workers: Array<{ close: () => Promise<void> }> = [];

export function registerWorkerForShutdown(worker: { close: () => Promise<void> }): void {
  _workers.push(worker);
}

export async function gracefulShutdown(signal: string): Promise<void> {
  logger.info(`[GracefulShutdown] Received ${signal} — shutting down BullMQ`);

  const workerCloses = _workers.map((w) =>
    w.close().catch((e) =>
      logger.warn("[GracefulShutdown] Worker close error", { message: e?.message })
    )
  );

  await Promise.all(workerCloses);
  await closeAllQueues();

  logger.info("[GracefulShutdown] All workers and queues closed");
}
