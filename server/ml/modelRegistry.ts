export interface ModelVersion {
  version:    string;
  activatedAt: string;
  notes?:     string;
}

interface RegistryState {
  current:   string;
  history:   ModelVersion[];
}

const state: RegistryState = {
  current: "logistic-v1.0",
  history: [{ version: "logistic-v1.0", activatedAt: new Date().toISOString(), notes: "Initial logistic regression model" }],
};

export function getModelVersion(): string {
  return state.current;
}

export function getVersionHistory(): ModelVersion[] {
  return [...state.history];
}

export function switchModel(version: string, notes?: string): ModelVersion {
  const entry: ModelVersion = {
    version,
    activatedAt: new Date().toISOString(),
    notes,
  };
  state.history.push(entry);
  state.current = version;
  console.log(`[ModelRegistry] Switched to ${version}`);
  return entry;
}

export function rollbackModel(): ModelVersion | null {
  if (state.history.length < 2) return null;

  state.history.pop();
  const prev = state.history[state.history.length - 1];
  state.current = prev.version;
  console.log(`[ModelRegistry] Rolled back to ${prev.version}`);
  return prev;
}

export function listVersions(): { current: string; history: ModelVersion[] } {
  return { current: state.current, history: getVersionHistory() };
}
