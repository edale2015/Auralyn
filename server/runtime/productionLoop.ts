import { runAutopilot } from "../autopilot/autopilotAgent";
import { getSystemState } from "../control/systemState";
import { broadcast } from "../control/controlBus";

let _loopHandle: ReturnType<typeof setInterval> | null = null;
let _running = false;
let _cycleCount = 0;
let _lastCycleTs = 0;

export function isLoopRunning(): boolean {
  return _running;
}

export function getCycleCount(): number {
  return _cycleCount;
}

export function watchdog(state: { safety: { mismatchRate: number } }): void {
  if (state.safety.mismatchRate > 0.02) {
    broadcast("watchdog_critical", { mismatchRate: state.safety.mismatchRate, ts: Date.now() });
    console.error("🚨 [Watchdog] CRITICAL: mismatch rate > 2% — system requires attention");
  }
}

export function startProductionLoop(intervalMs = 5_000): void {
  if (_running) {
    console.warn("[ProductionLoop] Already running — skipping duplicate start");
    return;
  }
  _running = true;
  console.log(`[ProductionLoop] 🔄 Starting production cycle every ${intervalMs}ms`);

  _loopHandle = setInterval(async () => {
    try {
      _cycleCount++;
      _lastCycleTs = Date.now();
      console.log(`[ProductionLoop] 🔄 Production cycle #${_cycleCount}`);

      await runAutopilot();

      const state = getSystemState();
      watchdog(state);

      broadcast("production_cycle", { cycle: _cycleCount, ts: _lastCycleTs });
    } catch (err: any) {
      console.error("[ProductionLoop] Cycle error:", err?.message ?? err);
    }
  }, intervalMs);
}

export function stopProductionLoop(): void {
  if (_loopHandle !== null) {
    clearInterval(_loopHandle);
    _loopHandle = null;
  }
  _running = false;
  console.log("[ProductionLoop] ⏹ Production loop stopped");
}

export function getLoopStatus(): {
  running: boolean;
  cycleCount: number;
  lastCycleTs: number;
} {
  return {
    running: _running,
    cycleCount: _cycleCount,
    lastCycleTs: _lastCycleTs,
  };
}
