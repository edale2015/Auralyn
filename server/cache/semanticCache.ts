/**
 * semanticCache.ts — Redis-backed semantic cache for RAG queries
 *
 * Article: "Before any of these hits the LLM, add a semantic cache. Identical
 *  and near-identical queries get served from cache instead of burning tokens."
 *
 * How it works:
 *   On query → embed the question → compare embedding against all cached embeddings
 *   If cosine similarity ≥ 0.92 → return cached answer (cache hit)
 *   If miss → run full pipeline → store embedding + answer in Redis
 *
 * Clinical benefit:
 *   "What is the first-line antibiotic for CAP?" and "What antibiotic do I use
 *   for community-acquired pneumonia?" have cosine similarity ~0.94. The second
 *   query serves from cache in <1ms instead of re-running GPT-4o + retrieval.
 *
 * Graceful fallback: if Redis is unavailable, returns null (cache miss) and
 *   skips storage — the system continues normally without caching.
 *
 * TTL: 3600 seconds (1 hour). Clinical guidelines rarely change intra-shift.
 */

import { cosineSimilarity } from "../retrieval/hybridRetriever";

// ── Redis lazy initialization ─────────────────────────────────────────────────

let _redis: import("ioredis").default | null = null;

async function getRedis(): Promise<import("ioredis").default | null> {
  if (_redis) return _redis;
  const url = process.env.REDIS_URL;
  if (!url) return null;
  try {
    const { default: Redis } = await import("ioredis");
    const client = new Redis(url, {
      lazyConnect:      true,
      connectTimeout:   3000,
      maxRetriesPerRequest: 1,
      enableOfflineQueue:   false,
    });
    await client.connect();
    _redis = client;
    return _redis;
  } catch {
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

const CACHE_PREFIX   = "rag_cache:";
const SIM_THRESHOLD  = 0.92;
const TTL_SECONDS    = 3600;

// ── checkCache ────────────────────────────────────────────────────────────────

export async function checkCache(
  query:     string,
  embedding: number[],
): Promise<string | null> {
  const redis = await getRedis();
  if (!redis) return null;

  try {
    const keys = await redis.keys(`${CACHE_PREFIX}*`);
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
    const keys = await redis.keys(`${CACHE_PREFIX}*`);
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
    const keys = await redis.keys(`${CACHE_PREFIX}*`);
    return { entries: keys.length, redisConnected: true, threshold: SIM_THRESHOLD, ttlSeconds: TTL_SECONDS };
  } catch {
    return { entries: 0, redisConnected: false, threshold: SIM_THRESHOLD, ttlSeconds: TTL_SECONDS };
  }
}
