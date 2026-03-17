interface MemoryEntry {
  type: string;
  key: string;
  value: any;
  timestamp: number;
  ttl?: number;
}

export class ClinicalMemoryEngine {
  private memory: MemoryEntry[] = [];
  private maxEntries = 1000;

  store(type: string, key: string, value: any, ttlMs?: number) {
    this.memory.push({ type, key, value, timestamp: Date.now(), ttl: ttlMs });
    if (this.memory.length > this.maxEntries) this.memory.shift();
  }

  retrieve(type: string, key: string): any | undefined {
    const entry = this.memory.filter((m) => m.type === type && m.key === key).pop();
    if (!entry) return undefined;
    if (entry.ttl && Date.now() - entry.timestamp > entry.ttl) return undefined;
    return entry.value;
  }

  getByType(type: string): MemoryEntry[] {
    return this.memory.filter((m) => m.type === type);
  }

  getRecent(limit: number = 50): MemoryEntry[] {
    return this.memory.slice(-limit).reverse();
  }

  getSummary() {
    const types: Record<string, number> = {};
    this.memory.forEach((m) => { types[m.type] = (types[m.type] || 0) + 1; });
    return { totalEntries: this.memory.length, byType: types, maxCapacity: this.maxEntries };
  }

  clear(type?: string) {
    if (type) {
      this.memory = this.memory.filter((m) => m.type !== type);
    } else {
      this.memory = [];
    }
  }
}

export const memoryEngine = new ClinicalMemoryEngine();
