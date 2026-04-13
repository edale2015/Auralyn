/**
 * server/cache/triageCache.ts — In-process LRU cache for triage decisions
 *
 * FIX (Code Review Issue #21):
 *   Previously buildTriageCacheKey() produced a key from complaint + answers only.
 *   This caused two critical problems:
 *
 *   1. Cross-tenant cache pollution: Two different clinics with the same complaint
 *      and answer set received identical cache entries. A cached decision for
 *      Clinic A's KB version was served to Clinic B without re-evaluation.
 *
 *   2. Stale KB decisions: After a KB rule update, the triage key was unchanged
 *      because it didn't include the KB version. Patients triaged after a rule
 *      update received the pre-update disposition until the TTL expired or the
 *      cache was manually invalidated.
 *
 *   Fixed: buildTriageCacheKey() now requires clinicId and kbVersion. Both are
 *   mandatory parameters (typed, not optional) so callers cannot accidentally
 *   omit them. Existing callers that don't have a kbVersion should pass the
 *   current KB migration timestamp or content hash.
 *
 *   invalidateTriageCacheForClinic() added: KB write hooks can call this to
 *   immediately evict all entries for a clinic after a rule update, rather
 *   than waiting for TTL expiry.
 */

import LRU from "lru-cache";

const TTL_MS = 1000 * 60 * 5;   // 5-minute TTL

const cache = new LRU<string, any>({
  max:    2000,
  maxAge: TTL_MS,
});

let hits   = 0;
let misses = 0;

// ── Cache access ──────────────────────────────────────────────────────────────

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

// ── Key construction (Issue #21 FIX) ─────────────────────────────────────────
//
// clinicId  — prevents cross-tenant cache sharing
// kbVersion — prevents stale decisions after KB rule updates
//
// Both parameters are required (not optional) so the compiler catches omissions.

export function buildTriageCacheKey(
  complaint:  string,
  answers:    Record<string, any>,
  clinicId:   string,    // FIX: now required — isolates cache per tenant
  kbVersion:  string,    // FIX: now required — invalidates on KB rule changes
): string {
  const normalized = {
    clinic:   clinicId,                           // tenant isolation
    kbv:      kbVersion,                          // KB version binding
    c:        complaint.trim().toLowerCase(),
    a: Object.fromEntries(
      Object.entries(answers)
        .sort(([a], [b]) => a.localeCompare(b))
        .filter(([, v]) => v !== undefined && v !== null)
    ),
  };
  return JSON.stringify(normalized);
}

// ── Cache invalidation ────────────────────────────────────────────────────────

/** Invalidate all cached triage decisions for a specific clinic (e.g. after KB update) */
export function invalidateTriageCacheForClinic(clinicId: string): number {
  const keysToDelete: string[] = [];
  cache.forEach((_value, key) => {
    try {
      const parsed = JSON.parse(key);
      if (parsed.clinic === clinicId) keysToDelete.push(key);
    } catch {
      // malformed key — skip
    }
  });
  for (const key of keysToDelete) cache.del(key);
  return keysToDelete.length;
}

/** Invalidate all cached decisions (full flush — use sparingly) */
export function invalidateTriageCache(): void {
  cache.reset();
}

// ── Stats ─────────────────────────────────────────────────────────────────────

export function getTriageCacheStats() {
  return {
    size:    cache.length,
    maxSize: 2000,
    ttlMs:   TTL_MS,
    hits,
    misses,
    hitRate: hits + misses > 0 ? Number((hits / (hits + misses)).toFixed(4)) : 0,
  };
}
