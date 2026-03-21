import os from "node:os";
import { upsertWorkerHeartbeat } from "../repos/workerMonitorRepo";

export function startWorkerHeartbeat(workerType: string): () => void {
  const workerId = `${workerType}-${os.hostname()}-${process.pid}`;

  const tick = async () => {
    try {
      await upsertWorkerHeartbeat({
        workerId,
        workerType,
        status: "running",
        hostname: os.hostname(),
        pid: process.pid,
        meta: {
          uptimeSeconds: process.uptime()
        }
      });
    } catch (err: any) {
      console.error("[WorkerHeartbeat] Failed to write heartbeat:", err?.message || err);
    }
  };

  tick();
  const interval = setInterval(tick, 10000);

  return () => clearInterval(interval);
}
