import { getSystemState } from "../control/systemState";
import { computeScale } from "../infra/awsAutoscale";
import { broadcast } from "../control/controlBus";
import { autopilotLevel } from "./autopilotUtils";

export interface AutopilotResult {
  actions: string[];
  mode: string;
  level: string;
  skippedCount: number;
  ts: string;
}

export async function runAutopilot(): Promise<AutopilotResult> {
  const state = getSystemState();
  const actions: string[] = [];
  let skippedCount = 0;

  const level = autopilotLevel(state);

  if (state.safety.mismatchRate > 0.01) {
    return {
      actions: ["Safety gate: mismatch rate too high — autopilot suspended"],
      mode: "SUSPENDED",
      level: "manual",
      skippedCount: 0,
      ts: new Date().toISOString(),
    };
  }

  if (state.infrastructure.regions.length > 0) {
    const scale = computeScale(50);
    actions.push(`Scale to ${scale} workers`);
  }

  if (state.ml.drift) {
    if (level === "manual") {
      skippedCount++;
    } else {
      actions.push("Trigger retraining");
      broadcast("autopilot_action", { action: "retraining", ts: Date.now() });
    }
  }

  if (Date.now() - state.simulation.lastRun > 60_000) {
    try {
      const { runSimulationBatch } = await import("../simulation/simulationRunner");
      await runSimulationBatch({ complaint: "chest pain", count: 50, difficulty: "easy" });
      actions.push("Refreshed simulation");
      broadcast("autopilot_action", { action: "simulation_refresh", ts: Date.now() });
    } catch {
      actions.push("Simulation refresh skipped (error)");
    }
  }

  broadcast("autopilot_run", { actions, level, ts: Date.now() });

  return {
    actions,
    mode: "SAFE_AUTOPILOT",
    level,
    skippedCount,
    ts: new Date().toISOString(),
  };
}
