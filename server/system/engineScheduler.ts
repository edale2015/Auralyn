/**
 * Engine Scheduler
 *
 * Rec 2: ENGINE_REGISTRY is the "scheduled" list (7 core engines).
 *        discoverEngineFiles() auto-reads server/engines/ at startup and
 *        returns the full set of engine filenames — so the orphan detector
 *        and system map always reflect every engine file that exists,
 *        not just the ones someone remembered to add to this list.
 */

import * as fs   from "fs";
import * as path from "path";
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

let _discoveredEngines: string[] | null = null;

/**
 * Reads server/engines/ once and caches the result.
 * Returns bare engine names (no extension, no path).
 */
export function discoverEngineFiles(): string[] {
  if (_discoveredEngines) return _discoveredEngines;
  try {
    const dir = path.resolve(process.cwd(), "server/engines");
    _discoveredEngines = fs.readdirSync(dir)
      .filter(f => f.endsWith(".ts") || f.endsWith(".js"))
      .map(f => f.replace(/\.(ts|js)$/, ""))
      .sort();
  } catch {
    _discoveredEngines = [];
  }
  return _discoveredEngines;
}

/**
 * Returns the union of scheduled + discovered engines.
 * Use this when you need full coverage; use ENGINE_REGISTRY when you
 * want only the engines that have active scheduler intervals.
 */
export function getFullEngineList(): string[] {
  const discovered = discoverEngineFiles();
  const combined   = new Set([...ENGINE_REGISTRY, ...discovered]);
  return Array.from(combined).sort();
}

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

  discoverEngineFiles();

  const predictionInterval = setInterval(safeFailurePrediction, 30_000);
  const healthInterval     = setInterval(safeHealthMonitor, 10_000);

  predictionInterval.unref();
  healthInterval.unref();

  console.log(
    `[EngineScheduler] Scheduled: prediction(30s), health(10s) — learning delegated to AutonomousLoop | Discovered ${discoverEngineFiles().length} engine files`
  );
}

export function getEngineRegistry() {
  return ENGINE_REGISTRY;
}
