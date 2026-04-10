import { getLiveSnapshot } from "../simulation/liveSimulator";

export interface SystemStateSnapshot {
  simulation: {
    running: boolean;
    lastRun: number;
    patients: number;
    load: string;
  };
  ml: {
    modelVersion: string;
    drift: boolean;
    activeModel: string;
  };
  automation: {
    templates: number;
    failures: number;
  };
  infrastructure: {
    regions: string[];
    healthy: boolean;
  };
  safety: {
    mismatchRate: number;
  };
  controls: {
    resetCount: number;
    lastResetAt: string | null;
    lastAlertAt: string | null;
  };
}

let _state: SystemStateSnapshot = {
  simulation: { running: false, lastRun: 0, patients: 0, load: "normal" },
  ml: { modelVersion: "v1", drift: false, activeModel: "v1" },
  automation: { templates: 12, failures: 0 },
  infrastructure: { regions: ["us-east-1", "us-west-2", "eu-central-1"], healthy: true },
  safety: { mismatchRate: 0.001 },
  controls: { resetCount: 0, lastResetAt: null, lastAlertAt: null },
};

export function getSystemState(): SystemStateSnapshot {
  const snap = getLiveSnapshot();
  if (snap) {
    _state.simulation.running = true;
    _state.simulation.lastRun = snap.ts ?? Date.now();
    _state.simulation.patients = snap.patients ?? 0;
    _state.simulation.load = snap.load ?? "normal";
  }
  return { ..._state };
}

export function patchSystemState(patch: Partial<SystemStateSnapshot>): void {
  _state = { ..._state, ...patch } as SystemStateSnapshot;
}

export function recordReset(): void {
  _state.controls.resetCount++;
  _state.controls.lastResetAt = new Date().toISOString();
}

export function recordAlert(): void {
  _state.controls.lastAlertAt = new Date().toISOString();
}

export function setActiveModel(version: string): void {
  _state.ml.activeModel = version;
  _state.ml.modelVersion = version;
}
