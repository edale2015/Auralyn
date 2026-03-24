import { getRedisClient } from "../redis/redisClient";

const memoryVectors: Map<string, number[]> = new Map();

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export async function storeVector(id: string, vector: number[]): Promise<void> {
  memoryVectors.set(id, vector);

  const redis = await getRedisClient();
  if (redis) {
    try {
      await redis.set(`vec:${id}`, JSON.stringify(vector), "EX", 604800);
    } catch (e: any) {
      console.warn(`[VectorStore] Redis write failed for ${id}: ${e?.message}`);
    }
  }
}

export async function searchVectors(
  queryVec: number[],
  topK = 5
): Promise<Array<{ id: string; score: number }>> {
  const candidates: Map<string, number[]> = new Map();

  const redis = await getRedisClient();
  if (redis) {
    try {
      const keys = await redis.keys("vec:*");
      if (keys.length > 0) {
        const vals = await redis.mget(...keys);
        keys.forEach((k: string, i: number) => {
          if (vals[i]) {
            candidates.set(k.replace("vec:", ""), JSON.parse(vals[i] as string));
          }
        });
      }
    } catch {}
  }

  for (const [id, vec] of memoryVectors) {
    if (!candidates.has(id)) candidates.set(id, vec);
  }

  const results: Array<{ id: string; score: number }> = [];
  for (const [id, vec] of candidates) {
    results.push({ id, score: cosineSimilarity(queryVec, vec) });
  }

  return results.sort((a, b) => b.score - a.score).slice(0, topK);
}

export async function getVector(id: string): Promise<number[] | null> {
  const redis = await getRedisClient();
  if (redis) {
    try {
      const raw = await redis.get(`vec:${id}`);
      if (raw) return JSON.parse(raw);
    } catch {}
  }
  return memoryVectors.get(id) ?? null;
}

export async function deleteVector(id: string): Promise<void> {
  memoryVectors.delete(id);
  const redis = await getRedisClient();
  if (redis) {
    try { await redis.del(`vec:${id}`); } catch {}
  }
}
