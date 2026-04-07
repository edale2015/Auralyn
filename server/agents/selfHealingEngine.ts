// ── Self-Healing Engine ────────────────────────────────────────────────────────
//
// Tracks per-agent health scores in Redis (shared across instances).
// Score formula:  successRate − (timeoutRate × 0.1) − (failureRate × 0.05)
// Range: −∞ to 1.  Score < 0 → agent is actively degrading patient outcomes.
//
// Falls back gracefully if Redis is unavailable — returns optimistic score 1.

import { getRedisAsync } from "../queue/redis";
import { logger }         from "../utils/logger";

const HEALTH_KEY_PREFIX = "agent:health";

export interface AgentHealthRecord {
  agent:       string;
  success:     number;
  failures:    number;
  timeouts:    number;
  total:       number;
  successRate: number;
  score:       number;
  lastUpdated: number;
}

export class SelfHealingEngine {

  // ── recordSuccess ─────────────────────────────────────────────────────────
  async recordSuccess(agent: string): Promise<void> {
    const redis = await getRedisAsync();
    if (!redis) return;
    try {
      const k = `${HEALTH_KEY_PREFIX}:${agent}`;
      await redis.hincrby(k, "success", 1);
      await redis.hset(k, "lastUpdated", Date.now());
    } catch (err) {
      logger.warn("[SelfHealing] recordSuccess failed", { agent, err });
    }
  }

  // ── recordFailure ─────────────────────────────────────────────────────────
  async recordFailure(agent: string, isTimeout = false): Promise<void> {
    const redis = await getRedisAsync();
    if (!redis) return;
    try {
      const k = `${HEALTH_KEY_PREFIX}:${agent}`;
      await redis.hincrby(k, "failures", 1);
      if (isTimeout) await redis.hincrby(k, "timeouts", 1);
      await redis.hset(k, "lastUpdated", Date.now());
    } catch (err) {
      logger.warn("[SelfHealing] recordFailure failed", { agent, err });
    }
  }

  // ── getHealth ─────────────────────────────────────────────────────────────
  async getHealth(agent: string): Promise<AgentHealthRecord> {
    const redis = await getRedisAsync();
    if (!redis) {
      return this._optimistic(agent);
    }

    try {
      const data    = await redis.hgetall(`${HEALTH_KEY_PREFIX}:${agent}`);
      const success = Number(data?.success  ?? 0);
      const failures = Number(data?.failures ?? 0);
      const timeouts = Number(data?.timeouts ?? 0);
      const lastUpdated = Number(data?.lastUpdated ?? 0);

      const total       = success + failures;
      const successRate = total === 0 ? 1 : success / total;
      const timeoutRate = total === 0 ? 0 : timeouts / total;
      const failureRate = total === 0 ? 0 : failures / total;

      const score = successRate - (timeoutRate * 0.1) - (failureRate * 0.05);

      return { agent, success, failures, timeouts, total, successRate, score, lastUpdated };
    } catch (err) {
      logger.warn("[SelfHealing] getHealth failed", { agent, err });
      return this._optimistic(agent);
    }
  }

  // ── getAllAgentsHealth ────────────────────────────────────────────────────
  async getAllAgentsHealth(): Promise<AgentHealthRecord[]> {
    const redis = await getRedisAsync();
    if (!redis) return [];

    try {
      const keys: string[] = await redis.keys(`${HEALTH_KEY_PREFIX}:*`);
      return Promise.all(
        keys.map(k => {
          const agent = k.replace(`${HEALTH_KEY_PREFIX}:`, "");
          return this.getHealth(agent);
        })
      );
    } catch (err) {
      logger.warn("[SelfHealing] getAllAgentsHealth failed", { err });
      return [];
    }
  }

  // ── resetAgent ────────────────────────────────────────────────────────────
  async resetAgent(agent: string): Promise<void> {
    const redis = await getRedisAsync();
    if (!redis) return;
    await redis.del(`${HEALTH_KEY_PREFIX}:${agent}`);
  }

  private _optimistic(agent: string): AgentHealthRecord {
    return { agent, success: 0, failures: 0, timeouts: 0, total: 0, successRate: 1, score: 1, lastUpdated: 0 };
  }
}

export const selfHealingEngine = new SelfHealingEngine();
