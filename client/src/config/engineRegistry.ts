export type EngineStatus = "active" | "degraded" | "stub";

export interface EngineRegistryEntry {
  name: string;
  status: EngineStatus;
}

export const ENGINE_REGISTRY: EngineRegistryEntry[] = [
  { name: "triage-engine", status: "active" },
  { name: "learning-engine", status: "active" },
  { name: "notification-engine", status: "active" },
  { name: "rare-disease-engine", status: "stub" },
  { name: "autonomous-agent", status: "active" },
  { name: "clinical-brain", status: "active" },
  { name: "outcome-learning", status: "active" },
  { name: "recovery-loop", status: "active" },
];

export function getEngineStatus(name: string): EngineStatus {
  return ENGINE_REGISTRY.find((e) => e.name === name)?.status ?? "stub";
}
