import { emitEvent } from "../controlTower/eventBus";

export type ChaosScenario =
  | "db_down"
  | "redis_down"
  | "openai_down"
  | "latency_spike"
  | "queue_overload"
  | "high_error_rate";

interface ChaosState {
  enabled: boolean;
  scenarios: Partial<Record<ChaosScenario, boolean>>;
  enabledAt: number | null;
  injectionLog: Array<{ type: ChaosScenario; injectedAt: number }>;
}

const state: ChaosState = {
  enabled: false,
  scenarios: {},
  enabledAt: null,
  injectionLog: [],
};

export function enableChaos(): void {
  state.enabled = true;
  state.enabledAt = Date.now();
  emitEvent({
    type: "CHAOS_INJECTED",
    payload: { action: "enabled", at: new Date().toISOString() },
    timestamp: Date.now(),
  });
  console.warn("[Chaos] ⚡ Chaos mode ENABLED");
}

export function disableChaos(): void {
  state.enabled = false;
  state.scenarios = {};
  state.enabledAt = null;
  emitEvent({
    type: "CHAOS_CLEARED",
    payload: { action: "disabled", at: new Date().toISOString() },
    timestamp: Date.now(),
  });
  console.warn("[Chaos] ✅ Chaos mode DISABLED — all scenarios cleared");
}

export function injectChaos(type: ChaosScenario): void {
  state.scenarios[type] = true;
  state.injectionLog.push({ type, injectedAt: Date.now() });
  if (state.injectionLog.length > 100) state.injectionLog.shift();
  emitEvent({
    type: "CHAOS_INJECTED",
    payload: { type, at: new Date().toISOString() },
    timestamp: Date.now(),
  });
  console.warn(`[Chaos] 🔴 Scenario injected: ${type}`);
}

export function clearChaos(type: ChaosScenario): void {
  delete state.scenarios[type];
  emitEvent({
    type: "CHAOS_CLEARED",
    payload: { type, at: new Date().toISOString() },
    timestamp: Date.now(),
  });
  console.warn(`[Chaos] 🟢 Scenario cleared: ${type}`);
}

export function isChaosActive(type: ChaosScenario): boolean {
  return state.enabled && state.scenarios[type] === true;
}

export function getChaosState() {
  return {
    enabled: state.enabled,
    scenarios: { ...state.scenarios },
    enabledAt: state.enabledAt ? new Date(state.enabledAt).toISOString() : null,
    activeCount: Object.values(state.scenarios).filter(Boolean).length,
    recentInjections: state.injectionLog.slice(-10),
  };
}

export async function maybeDelay(scenario: ChaosScenario = "latency_spike", delayMs = 2000): Promise<void> {
  if (isChaosActive(scenario)) {
    await new Promise((r) => setTimeout(r, delayMs));
  }
}
