/**
 * metaLearningEngine.ts
 * Self-tuning brain — adjusts engine importance weights and uncertainty
 * scaling based on outcome feedback.
 *
 * When a clinical decision proves correct (positive outcome), the engines
 * that contributed are rewarded (importance nudged up).
 * When a decision was wrong (negative outcome), involved engines are penalised.
 *
 * Weights are stored in Redis so they persist across restarts and accumulate
 * real clinical signal over time.
 *
 * The uncertainty scale factor (0.01–0.15) is also dynamically adjusted:
 * when the global error rate is high, uncertainty inflation is increased so
 * the system correctly communicates its unreliability to downstream consumers.
 */

import { getRedisAsync } from "../queue/redis";

const META_KEY = "meta:weights";

const MIN_IMPORTANCE = 1;
const MAX_IMPORTANCE = 5;
const LEARNING_RATE  = 0.1;

export class MetaLearningEngine {

  async updateEngineImportance(engine: string, outcome: number): Promise<void> {
    try {
      const redis = await getRedisAsync();
      if (!redis) return;

      const key     = `${META_KEY}:importance:${engine}`;
      let current   = 3;

      if (typeof redis.get === "function") {
        const stored = await redis.get(key);
        if (stored !== null) current = Number(stored);
      }

      const delta   = outcome > 0 ? LEARNING_RATE : -LEARNING_RATE;
      const updated = Math.max(MIN_IMPORTANCE, Math.min(MAX_IMPORTANCE, current + delta));

      if (typeof redis.set === "function") {
        await redis.set(key, String(updated));
      }
    } catch {
    }
  }

  async getEngineImportance(engine: string): Promise<number> {
    try {
      const redis = await getRedisAsync();
      if (!redis) return 3;

      const key = `${META_KEY}:importance:${engine}`;
      if (typeof redis.get === "function") {
        const val = await redis.get(key);
        if (val !== null) return Number(val);
      }
    } catch {
    }
    return 3;
  }

  async getAll(): Promise<Record<string, number>> {
    try {
      const redis = await getRedisAsync();
      if (!redis) return {};

      const result: Record<string, number> = {};
      let keys: string[] = [];

      if (typeof redis.keys === "function") {
        keys = await redis.keys(`${META_KEY}:importance:*`);
      }

      for (const k of keys) {
        const parts  = k.split(":");
        const engine = parts[parts.length - 1];
        let val: string | null = null;
        if (typeof redis.get === "function") {
          val = await redis.get(k);
        }
        if (val !== null) result[engine] = Number(val);
      }

      return result;
    } catch {
      return {};
    }
  }

  /**
   * Adjusts the uncertainty scale factor based on system-wide error rate.
   * Called periodically by the self-healing loop.
   */
  async adjustUncertaintyScaling(globalErrorRate: number): Promise<void> {
    try {
      const redis = await getRedisAsync();
      if (!redis) return;

      let scale = 0.03;
      if (globalErrorRate > 0.5) scale = 0.10;
      else if (globalErrorRate > 0.3) scale = 0.06;

      if (typeof redis.set === "function") {
        await redis.set(`${META_KEY}:uncertainty_scale`, String(scale));
      }
    } catch {
    }
  }

  async getUncertaintyScale(): Promise<number> {
    try {
      const redis = await getRedisAsync();
      if (!redis) return 0.03;

      if (typeof redis.get === "function") {
        const val = await redis.get(`${META_KEY}:uncertainty_scale`);
        if (val !== null) return Number(val);
      }
    } catch {
    }
    return 0.03;
  }

  /**
   * Record an outcome for a completed clinical encounter.
   * outcomeImproved = true → engines that ran got +1
   * outcomeImproved = false → engines that ran got -1
   */
  async recordOutcome(enginesRan: string[], outcomeImproved: boolean): Promise<void> {
    const reward = outcomeImproved ? 1 : -1;
    await Promise.allSettled(
      enginesRan.map((e) => this.updateEngineImportance(e, reward)),
    );
  }
}

export const metaLearning = new MetaLearningEngine();
