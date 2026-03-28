import { logSecureEvent } from "../ops/secureAudit";

export type DriftAction = "NONE" | "WARN" | "LOCK_MODEL" | "ROLLBACK";

export interface DriftEvent {
  timestamp: string;
  metric: string;
  baseline: number;
  current: number;
  delta: number;
  action: DriftAction;
  reason: string;
}

interface DriftState {
  locked: boolean;
  lockReason?: string;
  lockedAt?: string;
  rollbackVersion?: string;
  driftHistory: DriftEvent[];
}

const state: DriftState = {
  locked: false,
  driftHistory: [],
};

const WARN_THRESHOLD = 0.05;
const LOCK_THRESHOLD = 0.10;

export function handleDrift(drift: {
  drift: boolean;
  metric?: string;
  baseline?: number;
  current?: number;
  rollbackVersion?: string;
}): { action: DriftAction; reason: string; locked: boolean } {
  const metric = drift.metric ?? "accuracy";
  const baseline = drift.baseline ?? 0.85;
  const current = drift.current ?? 0.75;
  const delta = +(baseline - current).toFixed(4);

  if (!drift.drift || delta <= 0) {
    return { action: "NONE", reason: "no_drift_detected", locked: state.locked };
  }

  let action: DriftAction;
  let reason: string;

  if (delta >= LOCK_THRESHOLD) {
    state.locked = true;
    state.lockReason = `${metric} dropped ${(delta * 100).toFixed(1)}% (≥${LOCK_THRESHOLD * 100}% threshold)`;
    state.lockedAt = new Date().toISOString();
    state.rollbackVersion = drift.rollbackVersion;
    action = "LOCK_MODEL";
    reason = state.lockReason;

    logSecureEvent({
      type: "MODEL_DRIFT_LOCK",
      metric,
      baseline,
      current,
      delta,
      rollbackVersion: drift.rollbackVersion,
    });
  } else {
    action = "WARN";
    reason = `${metric} drifted ${(delta * 100).toFixed(1)}% — within warning band`;
  }

  const event: DriftEvent = {
    timestamp: new Date().toISOString(),
    metric,
    baseline,
    current,
    delta,
    action,
    reason,
  };
  state.driftHistory.push(event);

  return { action, reason, locked: state.locked };
}

export function isLocked(): boolean {
  return state.locked;
}

export function unlockModel(authorizedBy: string): { unlocked: boolean; message: string } {
  if (!state.locked) return { unlocked: false, message: "Model is not locked" };
  state.locked = false;
  logSecureEvent({ type: "MODEL_DRIFT_UNLOCK", authorizedBy, previousLockReason: state.lockReason });
  state.lockReason = undefined;
  return { unlocked: true, message: "Model drift lock released" };
}

export function getDriftState() {
  return {
    active: true,
    locked: state.locked,
    lockReason: state.lockReason,
    lockedAt: state.lockedAt,
    historyCount: state.driftHistory.length,
    lastEvent: state.driftHistory.at(-1) ?? null,
  };
}
