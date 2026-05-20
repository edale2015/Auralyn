/**
 * semanticCache.ts — Redis-backed semantic cache for RAG queries
 *
 * FIXED (Bug #4): checkCache() previously called redis.keys("rag_cache:*") on every
 * incoming query — a full keyspace KEYS scan that blocks the Redis event loop.
 * In production with thousands of entries this degrades to seconds per query and
 * can make Redis unresponsive for all other operations.
 *
 * Fix: replaced redis.keys() with cursor-based SCAN iteration (non-blocking).
 * clearCache() and cacheStats() also use SCAN.
 *
 * How it works:
 *   On query → embed the question → compare embedding against all cached embeddings
 *   If cosine similarity ≥ 0.92 → return cached answer (cache hit)
 *   If miss → run full pipeline → store embedding + answer in Redis
 *
 * TTL: 3600 seconds (1 hour). Clinical guidelines rarely change intra-shift.
 * Graceful fallback: if Redis is unavailable, returns null (cache miss) and
 *   skips storage — the system continues normally without caching.
 */

import { cosineSimilarity } from "../retrieval/hybridRetriever";

// ── Redis lazy initialization ─────────────────────────────────────────────────

let _redis: import("ioredis").default | null = null;
let _redisUnavailable = false;  // after first failed probe, stop retrying

async function getRedis(): Promise<import("ioredis").default | null> {
  if (_redisUnavailable) return null;
  if (_redis) return _redis;
  const url = process.env.REDIS_URL;
  if (!url) { _redisUnavailable = true; return null; }
  try {
    const { default: Redis } = await import("ioredis");
    const client = new Redis(url, {
      lazyConnect:          true,
      connectTimeout:       3000,
      maxRetriesPerRequest: null,
      enableOfflineQueue:   false,
      retryStrategy:        () => null,
    });
    client.on('error', () => {});
    client.on('close', () => { _redis = null; _redisUnavailable = true; });
    client.on('end',   () => { _redis = null; _redisUnavailable = true; });
    await client.connect();
    const pong = await client.ping();
    if (pong !== 'PONG') throw new Error('ping failed');
    _redis = client;
    return _redis;
  } catch {
    _redisUnavailable = true;
    return null;
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CacheEntry {
  query:     string;
  embedding: number[];
  response:  string;
  cachedAt:  number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CACHE_PREFIX  = "rag_cache:";
const SIM_THRESHOLD = 0.92;
const TTL_SECONDS   = 3600;
const SCAN_COUNT    = 100;  // keys fetched per SCAN iteration

// ── SCAN helper ───────────────────────────────────────────────────────────────
// Non-blocking cursor scan — does not block the Redis event loop.

async function scanKeys(redis: import("ioredis").default, pattern: string): Promise<string[]> {
  const keys: string[] = [];
  let cursor = "0";
  do {
    const [nextCursor, batch] = await redis.scan(cursor, "MATCH", pattern, "COUNT", SCAN_COUNT);
    cursor = nextCursor;
    keys.push(...batch);
  } while (cursor !== "0");
  return keys;
}

// ── checkCache ────────────────────────────────────────────────────────────────

export async function checkCache(
  query:     string,
  embedding: number[],
): Promise<string | null> {
  const redis = await getRedis();
  if (!redis) return null;

  try {
    // FIXED: use cursor-based SCAN instead of blocking KEYS
    const keys = await scanKeys(redis, `${CACHE_PREFIX}*`);
    if (keys.length === 0) return null;

    for (const key of keys) {
      const raw = await redis.get(key);
      if (!raw) continue;

      const entry: CacheEntry = JSON.parse(raw);
      if (!entry.embedding || entry.embedding.length === 0) continue;

      const sim = cosineSimilarity(embedding, entry.embedding);
      if (sim >= SIM_THRESHOLD) {
        return entry.response;
      }
    }
    return null;
  } catch {
    return null;
  }
}

// ── storeCache ────────────────────────────────────────────────────────────────

export async function storeCache(
  query:     string,
  embedding: number[],
  response:  string,
): Promise<void> {
  const redis = await getRedis();
  if (!redis) return;

  try {
    const entry: CacheEntry = {
      query,
      embedding,
      response,
      cachedAt: Date.now(),
    };
    const key = `${CACHE_PREFIX}${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await redis.set(key, JSON.stringify(entry), "EX", TTL_SECONDS);
  } catch {
    // Cache write failure is non-fatal
  }
}

// ── clearCache ────────────────────────────────────────────────────────────────

export async function clearCache(): Promise<{ cleared: number }> {
  const redis = await getRedis();
  if (!redis) return { cleared: 0 };

  try {
    const keys = await scanKeys(redis, `${CACHE_PREFIX}*`);
    if (keys.length > 0) await redis.del(...keys);
    return { cleared: keys.length };
  } catch {
    return { cleared: 0 };
  }
}

// ── cacheStats ────────────────────────────────────────────────────────────────

export async function cacheStats(): Promise<{
  entries: number;
  redisConnected: boolean;
  threshold: number;
  ttlSeconds: number;
}> {
  const redis = await getRedis();
  if (!redis) return { entries: 0, redisConnected: false, threshold: SIM_THRESHOLD, ttlSeconds: TTL_SECONDS };

  try {
    const keys = await scanKeys(redis, `${CACHE_PREFIX}*`);
    return { entries: keys.length, redisConnected: true, threshold: SIM_THRESHOLD, ttlSeconds: TTL_SECONDS };
  } catch {
    return { entries: 0, redisConnected: false, threshold: SIM_THRESHOLD, ttlSeconds: TTL_SECONDS };
  }
}
