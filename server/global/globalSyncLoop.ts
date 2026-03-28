import { buildExportPayload } from "./exporter";
import {
  updateLocalClinicNode,
  runGlobalAggregationCycle,
} from "./globalIntelligenceStore";

let loopHandle: ReturnType<typeof setInterval> | null = null;

export function runSyncCycle(): void {
  try {
    const payload = buildExportPayload();
    updateLocalClinicNode(payload);
    runGlobalAggregationCycle(payload);
  } catch (err: any) {
    console.error("[GlobalSyncLoop] Cycle error:", err.message);
  }
}

export function startGlobalSyncLoop(intervalMs = 600_000): void {
  console.log("[GlobalSyncLoop] Started (every 10 min + immediate run in 15s)");
  setTimeout(() => runSyncCycle(), 15_000);
  loopHandle = setInterval(() => runSyncCycle(), intervalMs);
}

export function stopGlobalSyncLoop(): void {
  if (loopHandle) {
    clearInterval(loopHandle);
    loopHandle = null;
    console.log("[GlobalSyncLoop] Stopped");
  }
}
