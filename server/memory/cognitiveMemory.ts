/**
 * cognitiveMemory.ts
 * Persistent case memory — the brain remembers which reasoning patterns
 * were successful and uses them to boost confidence when it encounters
 * similar cases.
 *
 * Storage: Redis hash per case (KEY:caseKey → JSON blob).
 * Retrieval: Dot-product similarity over numeric feature vectors.
 *
 * Integration with clinicalBrainEngine.ts:
 *   - Before phase 2, call retrieveSimilar(features) to get up to 5 similar cases.
 *   - If similar successful cases exist, reduce uncertainty by up to 20%.
 *   - After a positive outcome, call store() to add the case to memory.
 */

import { getRedisAsync } from "../queue/redis";

const KEY_PREFIX  = "cognitive:memory";
const MAX_RESULTS = 5;

export interface CognitiveMemoryEntry {
  caseKey:    string;
  features:   number[];
  outcome?:   string;
  diagnosis?: string;
  confidence?: number;
  storedAt:   number;
}

export class CognitiveMemory {

  async store(caseKey: string, data: Omit<CognitiveMemoryEntry, "caseKey" | "storedAt">): Promise<void> {
    try {
      const redis = await getRedisAsync();
      if (!redis) return;

      const entry: CognitiveMemoryEntry = { caseKey, storedAt: Date.now(), ...data };

      if (typeof redis.set === "function") {
        await redis.set(`${KEY_PREFIX}:${caseKey}`, JSON.stringify(entry));
      }
    } catch {
    }
  }

  async retrieveSimilar(
    features: number[],
    topK:     number = MAX_RESULTS,
  ): Promise<(CognitiveMemoryEntry & { similarity: number })[]> {
    if (!features.length) return [];

    try {
      const redis = await getRedisAsync();
      if (!redis) return [];

      let keys: string[] = [];
      if (typeof redis.keys === "function") {
        keys = await redis.keys(`${KEY_PREFIX}:*`);
      }

      const results: (CognitiveMemoryEntry & { similarity: number })[] = [];

      for (const k of keys) {
        let raw: string | null = null;
        if (typeof redis.get === "function") {
          raw = await redis.get(k);
        }
        if (!raw) continue;

        let entry: CognitiveMemoryEntry;
        try {
          entry = JSON.parse(raw);
        } catch {
          continue;
        }

        const sim = this.computeSimilarity(features, entry.features ?? []);
        if (sim > 0.3) {
          results.push({ ...entry, similarity: sim });
        }
      }

      return results
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, topK);
    } catch {
      return [];
    }
  }

  /**
   * Dot-product cosine similarity, bounded 0–1.
   * Returns 0 when either vector is empty.
   */
  computeSimilarity(a: number[], b: number[]): number {
    if (!a.length || !b.length) return 0;

    const len  = Math.min(a.length, b.length);
    let dot    = 0;
    let normA  = 0;
    let normB  = 0;

    for (let i = 0; i < len; i++) {
      dot   += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    if (denom === 0) return 0;

    return Math.max(0, Math.min(1, dot / denom));
  }

  async deleteCase(caseKey: string): Promise<void> {
    try {
      const redis = await getRedisAsync();
      if (!redis) return;
      if (typeof redis.del === "function") {
        await redis.del(`${KEY_PREFIX}:${caseKey}`);
      }
    } catch {
    }
  }
}

export const cognitiveMemory = new CognitiveMemory();
