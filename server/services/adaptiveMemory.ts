export type AdaptiveMemoryEntry = {
  clinicId: string;
  timestamp: string;
  safetyMode: string;
  confidenceThreshold: number;
  routingPolicy: string;
};

const adaptiveMemoryStore: AdaptiveMemoryEntry[] = [];

export function saveAdaptiveMemory(entry: AdaptiveMemoryEntry) {
  adaptiveMemoryStore.push(entry);
  return entry;
}

export function getAdaptiveMemory(clinicId: string) {
  return adaptiveMemoryStore.filter(e => e.clinicId === clinicId);
}
