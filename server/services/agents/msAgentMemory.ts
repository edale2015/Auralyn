export interface MemoryEntry {
  key: string;
  value: unknown;
  timestamp: string;
  ttlMs?: number;
}

const memory = new Map<string, MemoryEntry>();

export function setMemory(key: string, value: unknown, ttlMs?: number): void {
  memory.set(key, { key, value, timestamp: new Date().toISOString(), ttlMs });
}

export function getMemory(key: string): unknown | undefined {
  const entry = memory.get(key);
  if (!entry) return undefined;
  if (entry.ttlMs && Date.now() - new Date(entry.timestamp).getTime() > entry.ttlMs) {
    memory.delete(key);
    return undefined;
  }
  return entry.value;
}

export function clearMemory(): void { memory.clear(); }
export function listMemoryKeys(): string[] { return Array.from(memory.keys()); }
