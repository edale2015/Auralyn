/**
 * LOOP REGISTRY — Centralized background loop heartbeat tracker
 *
 * All long-running background loops register here. The registry tracks:
 *   - Last heartbeat timestamp
 *   - Total cycle count
 *   - Error count
 *   - Restart capability via a restart function
 *
 * Admin can query /api/system/loops for live status.
 * autoHealer uses this to detect and restart crashed loops.
 */

export interface LoopEntry {
  name: string;
  description: string;
  intervalMs: number;
  lastHeartbeat: number;
  startedAt: number;
  cycleCount: number;
  errorCount: number;
  status: "running" | "stale" | "crashed" | "stopped";
  restartFn?: () => void;
}

const registry = new Map<string, LoopEntry>();

export function registerLoop(
  name: string,
  description: string,
  intervalMs: number,
  restartFn?: () => void,
): void {
  registry.set(name, {
    name,
    description,
    intervalMs,
    lastHeartbeat: Date.now(),
    startedAt: Date.now(),
    cycleCount: 0,
    errorCount: 0,
    status: "running",
    restartFn,
  });
  console.log(`[LoopRegistry] Registered: ${name}`);
}

export function heartbeatLoop(name: string): void {
  const entry = registry.get(name);
  if (!entry) return;
  entry.lastHeartbeat = Date.now();
  entry.cycleCount++;
  entry.status = "running";
}

export function errorLoop(name: string): void {
  const entry = registry.get(name);
  if (!entry) return;
  entry.errorCount++;
}

export function stopLoop(name: string): void {
  const entry = registry.get(name);
  if (!entry) return;
  entry.status = "stopped";
}

export function getAllLoops(): LoopEntry[] {
  const now = Date.now();
  const entries = Array.from(registry.values());

  for (const entry of entries) {
    if (entry.status === "stopped") continue;
    const staleSec = (now - entry.lastHeartbeat) / 1000;
    const expectedIntervalSec = (entry.intervalMs / 1000) * 3;
    if (staleSec > expectedIntervalSec && entry.status === "running") {
      entry.status = "stale";
    }
  }

  return entries;
}

export function getLoopSummary(): {
  total: number;
  running: number;
  stale: number;
  crashed: number;
  stopped: number;
} {
  const all = getAllLoops();
  return {
    total: all.length,
    running: all.filter((e) => e.status === "running").length,
    stale: all.filter((e) => e.status === "stale").length,
    crashed: all.filter((e) => e.status === "crashed").length,
    stopped: all.filter((e) => e.status === "stopped").length,
  };
}

export function attemptRestartStaleLoops(): string[] {
  const restarted: string[] = [];
  for (const entry of getAllLoops()) {
    if ((entry.status === "stale" || entry.status === "crashed") && entry.restartFn) {
      console.warn(`[LoopRegistry] Restarting stale/crashed loop: ${entry.name}`);
      try {
        entry.restartFn();
        entry.lastHeartbeat = Date.now();
        entry.status = "running";
        restarted.push(entry.name);
      } catch (err: any) {
        console.error(`[LoopRegistry] Restart failed for ${entry.name}: ${err.message}`);
        entry.status = "crashed";
      }
    }
  }
  return restarted;
}
