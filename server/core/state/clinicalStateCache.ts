import { rebuildClinicalState } from "./clinicalStateProjector"

interface CacheEntry {
  state: Record<string, any>
  cachedAt: number
}

const cache = new Map<string, CacheEntry>()
const TTL_MS = 60_000

export async function getCachedState(caseId: string): Promise<Record<string, any>> {
  const entry = cache.get(caseId)
  if (entry && Date.now() - entry.cachedAt < TTL_MS) {
    return entry.state
  }

  const state = await rebuildClinicalState(caseId)
  cache.set(caseId, { state, cachedAt: Date.now() })
  return state
}

export function invalidateState(caseId: string): void {
  cache.delete(caseId)
}

export function invalidateAll(): void {
  cache.clear()
}

export function getCacheStats(): { size: number; keys: string[] } {
  return { size: cache.size, keys: Array.from(cache.keys()) }
}
