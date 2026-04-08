/**
 * engineBandit.ts
 * Multi-armed bandit for engine selection — learns which engines
 * add the most diagnostic value for a given clinical scenario.
 *
 * Algorithm: Epsilon-greedy UCB (upper confidence bound) using Redis
 * to persist counts and rewards across requests and restarts.
 *
 * Usage:
 *   1. Rank engines before Phase 3 to skip low-value ones.
 *   2. Record reward (+1 good outcome, -1 bad) after the encounter resolves.
 *   3. Over time, low-yield engines are automatically de-prioritised.
 *
 * Falls back to returning engines in original order when Redis is unavailable.
 */

import { getRedisAsync } from "../queue/redis";

const KEY_PREFIX = "engine:bandit";

export interface EngineBanditRecord {
  count:  number;
  reward: number;
  score:  number;
}

export class EngineBandit {

  async record(engine: string, reward: number): Promise<void> {
    try {
      const redis = await getRedisAsync();
      if (!redis) return;

      const key = `${KEY_PREFIX}:${engine}`;
      if (typeof redis.hincrby === "function") {
        await redis.hincrby(key, "count", 1);
      }
      if (typeof redis.hincrbyfloat === "function") {
        await redis.hincrbyfloat(key, "reward", reward);
      }
    } catch {
    }
  }

  async score(engine: string): Promise<number> {
    try {
      const redis = await getRedisAsync();
      if (!redis) return 0.5;

      const key  = `${KEY_PREFIX}:${engine}`;
      let data: Record<string, string> = {};
      if (typeof redis.hgetall === "function") {
        data = (await redis.hgetall(key)) ?? {};
      }

      const count  = Number(data.count  ?? 1);
      const reward = Number(data.reward ?? 0);

      if (count === 0) return 0.5;

      const exploitation = reward / count;
      const exploration  = Math.sqrt(Math.log(count + 1) / count);

      return Math.max(0, Math.min(1, exploitation + 0.1 * exploration));
    } catch {
      return 0.5;
    }
  }

  async rank(engines: string[]): Promise<{ engine: string; score: number }[]> {
    const scored = await Promise.all(
      engines.map(async (e) => ({ engine: e, score: await this.score(e) })),
    );
    return scored.sort((a, b) => b.score - a.score);
  }

  async getAll(): Promise<Record<string, EngineBanditRecord>> {
    try {
      const redis = await getRedisAsync();
      if (!redis) return {};

      const result: Record<string, EngineBanditRecord> = {};
      let keys: string[] = [];
      if (typeof redis.keys === "function") {
        keys = await redis.keys(`${KEY_PREFIX}:*`);
      }

      for (const k of keys) {
        const parts = k.split(":");
        const name  = parts[parts.length - 1];
        let data: Record<string, string> = {};
        if (typeof redis.hgetall === "function") {
          data = (await redis.hgetall(k)) ?? {};
        }

        const count  = Number(data.count  ?? 0);
        const reward = Number(data.reward ?? 0);
        result[name] = {
          count,
          reward,
          score: count > 0 ? reward / count : 0,
        };
      }

      return result;
    } catch {
      return {};
    }
  }
}

export const engineBandit = new EngineBandit();
