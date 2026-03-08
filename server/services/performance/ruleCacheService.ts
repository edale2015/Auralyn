const ruleCache = new Map<string, { data: unknown; timestamp: number; ttlMs: number }>();

export function cacheRule(key: string, data: unknown, ttlMs = 60000): void {
  ruleCache.set(key, { data, timestamp: Date.now(), ttlMs });
}

export function getCachedRule(key: string): unknown | undefined {
  const entry = ruleCache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.timestamp > entry.ttlMs) { ruleCache.delete(key); return undefined; }
  return entry.data;
}

export function invalidateRuleCache(pattern?: string): number {
  if (!pattern) { const count = ruleCache.size; ruleCache.clear(); return count; }
  let count = 0;
  for (const key of ruleCache.keys()) {
    if (key.includes(pattern)) { ruleCache.delete(key); count++; }
  }
  return count;
}

export function getRuleCacheStats(): { size: number; keys: string[] } {
  return { size: ruleCache.size, keys: Array.from(ruleCache.keys()) };
}
