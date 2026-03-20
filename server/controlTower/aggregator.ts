import { subscribeToTower, TowerEvent } from "./eventBus";

const MAX_PATIENTS = 500;
const MAX_ERRORS = 200;
const MAX_ALERTS = 100;

interface TowerState {
  patients: any[];
  errors: any[];
  engines: Record<string, string>;
  alerts: any[];
  lastUpdated: number;
}

const state: TowerState = {
  patients: [],
  errors: [],
  engines: {},
  alerts: [],
  lastUpdated: Date.now(),
};

function updateState(event: TowerEvent): void {
  state.lastUpdated = Date.now();

  if (event.type === "PATIENT_FLOW") {
    state.patients.push(event.payload);
    if (state.patients.length > MAX_PATIENTS) state.patients.shift();
  }

  if (event.type === "ERROR") {
    state.errors.push(event.payload);
    if (state.errors.length > MAX_ERRORS) state.errors.shift();
  }

  if (event.type === "ENGINE_STATUS") {
    state.engines[event.payload.name] = event.payload.status;
  }

  if (event.type === "ALERT") {
    state.alerts.push({ ...event.payload, timestamp: event.timestamp });
    if (state.alerts.length > MAX_ALERTS) state.alerts.shift();
  }
}

subscribeToTower(updateState);

export function getState(): TowerState {
  return state;
}

export function resetState(): void {
  state.patients = [];
  state.errors = [];
  state.engines = {};
  state.alerts = [];
  state.lastUpdated = Date.now();
}
