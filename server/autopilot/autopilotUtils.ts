import { repairTemplate } from "../control/systemControls";
import { broadcast } from "../control/controlBus";

export type AutopilotLevel = "auto" | "semi-auto" | "manual";

export interface KPISnapshot {
  erRate: number;
  avgLatencyMs: number;
  patients: number;
  safetyScore: number;
}

export interface RegionState {
  region: string;
  state: unknown;
  healthy?: boolean;
}

export function autopilotLevel(state: {
  safety: { mismatchRate: number };
  ml: { drift: boolean };
}): AutopilotLevel {
  if (state.safety.mismatchRate > 0.01) return "manual";
  if (state.ml.drift) return "semi-auto";
  return "auto";
}

export function computeKPIs(state: {
  er?: number;
  patients?: number;
  latency?: { avg?: number } | number[];
  safety?: { mismatchRate?: number };
}): KPISnapshot {
  const patients = state.patients ?? 0;
  const er       = state.er ?? 0;
  const erRate   = patients > 0 ? er / patients : 0;

  let avgLatencyMs = 0;
  if (Array.isArray(state.latency)) {
    avgLatencyMs = state.latency.length > 0
      ? state.latency.reduce((a: number, b: number) => a + b, 0) / state.latency.length
      : 0;
  } else if (state.latency && typeof (state.latency as any).avg === "number") {
    avgLatencyMs = (state.latency as any).avg;
  }

  const safetyScore = 1 - (state.safety?.mismatchRate ?? 0);

  return { erRate, avgLatencyMs, patients, safetyScore };
}

export function interruptSystem(reason: string): void {
  broadcast("system_interrupt", { reason, ts: Date.now() });
  console.error(`[Autopilot] 🚨 SYSTEM INTERRUPT: ${reason}`);
}

export function selfHeal(error: string): void {
  if (error.toLowerCase().includes("selector") || error.toLowerCase().includes("template")) {
    repairTemplate("auto");
  }
  broadcast("self_heal", { error, ts: Date.now() });
  console.warn(`[Autopilot] Self-heal triggered for: ${error}`);
}

export function syncGlobalState(regions: RegionState[]): unknown[] {
  return regions.map(r => r.state);
}
