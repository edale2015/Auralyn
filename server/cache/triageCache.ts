import LRU from "lru-cache";

const TTL_MS = 1000 * 60 * 5;

const cache = new LRU<string, any>({
  max: 2000,
  maxAge: TTL_MS,
});

let hits = 0;
let misses = 0;

export function getCachedTriage(key: string): any | undefined {
  const entry = cache.get(key);
  if (entry !== undefined) {
    hits++;
    return entry;
  }
  misses++;
  return undefined;
}

export function setCachedTriage(key: string, result: any): void {
  cache.set(key, result);
}

export function buildTriageCacheKey(complaint: string, answers: Record<string, any>): string {
  const normalized = {
    c: complaint.trim().toLowerCase(),
    a: Object.fromEntries(
      Object.entries(answers)
        .sort(([a], [b]) => a.localeCompare(b))
        .filter(([, v]) => v !== undefined && v !== null)
    ),
  };
  return JSON.stringify(normalized);
}

export function invalidateTriageCache(): void {
  cache.reset();
}

export function getTriageCacheStats() {
  return {
    size: cache.length,
    maxSize: 2000,
    ttlMs: TTL_MS,
    hits,
    misses,
    hitRate: hits + misses > 0 ? Number((hits / (hits + misses)).toFixed(4)) : 0,
  };
}
