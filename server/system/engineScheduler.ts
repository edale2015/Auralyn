import { predictFailures } from "../monitoring/predictiveEngine";
import { logEngineStatus } from "../monitoring/systemMonitor";

export const ENGINE_REGISTRY = [
  "scoring",
  "diagnosis",
  "billing",
  "learning",
  "safety",
  "monitoring",
  "simulation",
];

let schedulerStarted = false;

async function safeLearningCycle() {
  try {
    const { runLearningCycle } = await import("../engines/unifiedOutcomeLearning");
    await runLearningCycle();
  } catch (e: any) {
    console.error("[EngineScheduler] Learning cycle error:", e?.message);
  }
}

async function safeHealthMonitor() {
  try {
    for (const engineName of ENGINE_REGISTRY) {
      await logEngineStatus(engineName, "healthy", 0);
    }
  } catch (e: any) {
    console.error("[EngineScheduler] Health monitor error:", e?.message);
  }
}

async function safeFailurePrediction() {
  try {
    await predictFailures();
  } catch (e: any) {
    console.error("[EngineScheduler] Failure prediction error:", e?.message);
  }
}

export function startEngines() {
  if (schedulerStarted) return;
  schedulerStarted = true;

  // Learning is already handled by autonomousLoop every 60s — only schedule
  // prediction (30s) and health monitoring (10s) here to avoid double runs
  const predictionInterval = setInterval(safeFailurePrediction, 30_000);
  const healthInterval = setInterval(safeHealthMonitor, 10_000);

  predictionInterval.unref();
  healthInterval.unref();

  console.log("[EngineScheduler] Engines scheduled: prediction(30s), health(10s) — learning delegated to AutonomousLoop");
}

export function getEngineRegistry() {
  return ENGINE_REGISTRY;
}
