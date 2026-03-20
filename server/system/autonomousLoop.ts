import { predictFailures } from "../monitoring/predictiveEngine";
import { acquireLock, releaseLock } from "../locks/redisLock";
import { detectDrift } from "../monitoring/dataDrift";
import { emitEvent } from "../controlTower/eventBus";

const LEARNING_LOCK_KEY = "global_learning_lock";
const LEARNING_LOCK_TTL = 55_000;

let loopInterval: ReturnType<typeof setInterval> | null = null;
let cycleCount = 0;
let skippedCount = 0;

async function runLearningCycleSafe() {
  const acquired = await acquireLock(LEARNING_LOCK_KEY, LEARNING_LOCK_TTL);
  if (!acquired) {
    skippedCount++;
    console.log(`[AutonomousLoop] Learning cycle skipped — another instance holds the lock (skip #${skippedCount})`);
    return;
  }

  try {
    const { runLearningCycle } = await import("../engines/unifiedOutcomeLearning");
    await runLearningCycle();
  } catch (e: any) {
    console.error("[AutonomousLoop] Learning cycle error:", e?.message ?? e);
    emitEvent({ type: "ERROR", payload: { source: "learningCycle", error: e?.message }, timestamp: Date.now() });
  } finally {
    await releaseLock(LEARNING_LOCK_KEY);
  }
}

async function runPredictionSafe() {
  try {
    const result = await predictFailures();
    if (result.unstable) {
      console.warn(`[AutonomousLoop] ⚠️  Instability: ${result.recommendation}`);
    }
    return result;
  } catch (e: any) {
    console.error("[AutonomousLoop] Prediction error:", e?.message ?? e);
    return null;
  }
}

async function runDriftDetectionSafe() {
  try {
    const report = await detectDrift();
    if (report.drift) {
      console.warn(`[AutonomousLoop] Data drift detected: ${report.summary}`);
    }
    return report;
  } catch (e: any) {
    console.error("[AutonomousLoop] Drift detection error:", e?.message ?? e);
    return null;
  }
}

export function startAutonomousLoop(intervalMs = 60_000) {
  if (loopInterval) return;

  console.log(`[AutonomousLoop] Starting autonomous learning + failure prediction + drift detection loop (every ${intervalMs / 1000}s)`);

  loopInterval = setInterval(async () => {
    cycleCount++;
    console.log(`[AutonomousLoop] Cycle #${cycleCount} — learning + prediction + drift`);
    await Promise.all([runLearningCycleSafe(), runPredictionSafe(), runDriftDetectionSafe()]);
  }, intervalMs);

  loopInterval.unref?.();
}

export function stopAutonomousLoop() {
  if (loopInterval) {
    clearInterval(loopInterval);
    loopInterval = null;
    console.log("[AutonomousLoop] Stopped");
  }
}

export function getLoopStats() {
  return { running: !!loopInterval, cycleCount, skippedCount };
}
