interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  hits: number;
}

const store = new Map<string, CacheEntry<any>>();
let totalHits = 0;
let totalMisses = 0;
let totalSets = 0;

const DEFAULT_TTL_MS = 60_000;

export function getCache<T>(key: string): T | null {
  const entry = store.get(key);
  if (!entry) { totalMisses++; return null; }
  if (Date.now() > entry.expiresAt) { store.delete(key); totalMisses++; return null; }
  entry.hits++;
  totalHits++;
  return entry.value as T;
}

export function setCache<T>(key: string, value: T, ttlMs: number = DEFAULT_TTL_MS): void {
  store.set(key, { value, expiresAt: Date.now() + ttlMs, hits: 0 });
  totalSets++;
}

export function deleteCache(key: string): boolean {
  return store.delete(key);
}

export function clearCache(): void {
  store.clear();
}

export function purgeExpired(): number {
  const now = Date.now();
  let purged = 0;
  for (const [key, entry] of store.entries()) {
    if (now > entry.expiresAt) { store.delete(key); purged++; }
  }
  return purged;
}

export function getCacheStats() {
  const now = Date.now();
  const active = [...store.entries()].filter(([, e]) => now <= e.expiresAt).length;
  const hitRate = (totalHits + totalMisses) > 0
    ? +((totalHits / (totalHits + totalMisses)) * 100).toFixed(1)
    : 0;
  return {
    active: true,
    size: store.size,
    activeEntries: active,
    totalSets,
    totalHits,
    totalMisses,
    hitRate,
  };
}

setInterval(purgeExpired, 5 * 60_000);
