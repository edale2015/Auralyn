// ── Weight Adapter ─────────────────────────────────────────────────────────────
//
// Maps agent health scores → routing weights stored in Redis.
// Weights are consumed by the AdaptiveRouter and the RLHF weighting layer.
//
// Weight table:
//   score ≥ 0.8  → weight 1.0   (full confidence)
//   score ≥ 0.5  → weight 0.7
//   score ≥ 0.2  → weight 0.5
//   score ≥ 0    → weight 0.2   (degraded but still usable)
//   score < 0    → weight 0.1   (near-disable)

import { getRedisAsync }      from "../queue/redis";
import { selfHealingEngine }  from "./selfHealingEngine";
import { logger }              from "../utils/logger";

const WEIGHT_HASH_KEY = "agent:weight";

function scoreToWeight(score: number): number {
  if (score >= 0.8) return 1.0;
  if (score >= 0.5) return 0.7;
  if (score >= 0.2) return 0.5;
  if (score >= 0)   return 0.2;
  return 0.1;
}

export class WeightAdapter {

  async adjust(agent: string): Promise<void> {
    const redis = await getRedisAsync();
    if (!redis) return;

    try {
      const health    = await selfHealingEngine.getHealth(agent);
      const weight    = scoreToWeight(health.score);
      const prevRaw   = await redis.hget(WEIGHT_HASH_KEY, agent);
      const prevWeight = prevRaw !== null ? Number(prevRaw) : null;

      await redis.hset(WEIGHT_HASH_KEY, agent, weight);

      // FIX: Weight changes had no audit trail — invisible to operators.
      // Log every change (or reduction) so they are discoverable in operator dashboards.
      if (weight < 1.0) {
        logger.warn("[WeightAdapter] Weight reduced", {
          agent,
          weight,
          prevWeight,
          score:       health.score,
          successRate: health.successRate,
        });
      } else if (prevWeight !== null && prevWeight !== weight) {
        logger.info("[WeightAdapter] Weight changed", {
          agent,
          weight,
          prevWeight,
          score: health.score,
        });
      }
    } catch (err) {
      logger.warn("[WeightAdapter] adjust failed", { agent, err });
    }
  }

  async getWeight(agent: string): Promise<number> {
    const redis = await getRedisAsync();
    if (!redis) return 1.0;

    try {
      const w = await redis.hget(WEIGHT_HASH_KEY, agent);
      return w !== null ? Number(w) : 1.0;
    } catch {
      return 1.0;
    }
  }

  async getAllWeights(): Promise<Record<string, number>> {
    const redis = await getRedisAsync();
    if (!redis) return {};

    try {
      const data = await redis.hgetall(WEIGHT_HASH_KEY);
      if (!data) return {};
      return Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, Number(v)])
      );
    } catch {
      return {};
    }
  }
}

export const weightAdapter = new WeightAdapter();
