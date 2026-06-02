import { runRecovery, RecoveryAction } from "../recovery/recoveryEngine";
import { scaleUp } from "../recovery/scaleTrigger";

let loopInterval: ReturnType<typeof setInterval> | null = null;
let recoveryCount = 0;
let lastActions: RecoveryAction[] = [];
let lastRunAt: number | null = null;
let _isRunning = false;

async function runCycle() {
  if (_isRunning) return;
  _isRunning = true;
  try {
    const actions = await runRecovery();
    lastRunAt = Date.now();
    recoveryCount++;
    lastActions = actions;

    if (actions.length > 0) {
      console.log(
        `[RecoveryLoop] Cycle #${recoveryCount} — ${actions.length} action(s): ` +
        actions.map((a) => `[${a.severity}] ${a.trigger}`).join(" | ")
      );

      const needsScaleUp = actions.some(
        (a) => a.category === "scaling" && a.severity === "CRITICAL"
      );
      if (needsScaleUp) {
        scaleUp(10, "high-error-rate-recovery").catch(() => {});
      }
    }
  } finally {
    _isRunning = false;
  }
}

export function startRecoveryLoop(intervalMs = 30_000): void {
  if (loopInterval) return;
  console.log(`[RecoveryLoop] Starting automated recovery loop (every ${intervalMs / 1000}s)`);
  loopInterval = setInterval(async () => {
    await runCycle().catch((e: any) =>
      console.error("[RecoveryLoop] Cycle error:", e?.message)
    );
  }, intervalMs);
  loopInterval.unref?.();
}

export function stopRecoveryLoop(): void {
  if (loopInterval) {
    clearInterval(loopInterval);
    loopInterval = null;
  }
}

export function getRecoveryStats() {
  return {
    running: loopInterval !== null,
    cycles: recoveryCount,
    lastRunAt: lastRunAt ? new Date(lastRunAt).toISOString() : null,
    lastActions,
  };
}
