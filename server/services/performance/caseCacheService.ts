const caseCache = new Map<string, { data: unknown; timestamp: number }>();
const CASE_TTL_MS = 120000;

export function cacheCase(caseId: string, data: unknown): void {
  caseCache.set(caseId, { data, timestamp: Date.now() });
}

export function getCachedCase(caseId: string): unknown | undefined {
  const entry = caseCache.get(caseId);
  if (!entry) return undefined;
  if (Date.now() - entry.timestamp > CASE_TTL_MS) { caseCache.delete(caseId); return undefined; }
  return entry.data;
}

export function invalidateCaseCache(caseId?: string): void {
  if (caseId) caseCache.delete(caseId);
  else caseCache.clear();
}

export function getCaseCacheStats(): { size: number; keys: string[] } {
  return { size: caseCache.size, keys: Array.from(caseCache.keys()) };
}
