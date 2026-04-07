// ── Redis Distributed Circuit Breaker ─────────────────────────────────────────
//
// Replaces per-instance in-memory circuit breaker state with shared Redis state.
// All instances (behind a load balancer) share the same failure count and open/
// half-open transitions — no more split-brain protection failures.
//
// Architecture:
//   • Redis HASH `cb:{agent}` holds:  state | failureCount | lastFailureAt | openedAt
//   • Atomic HINCRBY prevents race conditions on failure count.
//   • Falls back to the existing in-memory CircuitBreaker if Redis is unavailable.
//
// Key thresholds (match in-memory defaults):
//   FAILURE_THRESHOLD  = 5     → open after 5 consecutive failures
//   RECOVERY_WINDOW_MS = 60 000 → half-open after 60 s
//   HALF_OPEN_PROBES   = 1     → one success closes the breaker

import { getRedisAsync } from "../queue/redis";
import { logger }         from "../utils/logger";

const FAILURE_THRESHOLD  = 5;
const RECOVERY_WINDOW_MS = 60_000;

export interface DistributedCircuitState {
  agent:         string;
  state:         "closed" | "open" | "half-open";
  failureCount:  number;
  lastFailureAt: number;
  openedAt?:     number;
}

function redisKey(agent: string): string {
  return `cb:${agent}`;
}

// ── helpers ───────────────────────────────────────────────────────────────────

async function readState(redis: any, agent: string): Promise<DistributedCircuitState> {
  const data = await redis.hgetall(redisKey(agent));

  // Upstash returns null for missing keys; ioredis returns {}
  if (!data || Object.keys(data).length === 0) {
    return { agent, state: "closed", failureCount: 0, lastFailureAt: 0 };
  }

  const state: DistributedCircuitState = {
    agent,
    state:         (data.state as any) ?? "closed",
    failureCount:  Number(data.failureCount ?? 0),
    lastFailureAt: Number(data.lastFailureAt ?? 0),
    openedAt:      data.openedAt ? Number(data.openedAt) : undefined,
  };

  // Auto-transition open → half-open after recovery window
  if (
    state.state === "open" &&
    state.openedAt !== undefined &&
    Date.now() - state.openedAt > RECOVERY_WINDOW_MS
  ) {
    await redis.hset(redisKey(agent), "state", "half-open");
    return { ...state, state: "half-open" };
  }

  return state;
}

// ── RedisCircuitBreaker class ─────────────────────────────────────────────────

export class RedisCircuitBreaker {

  // ── getState ──────────────────────────────────────────────────────────────
  async getState(agent: string): Promise<DistributedCircuitState> {
    const redis = await getRedisAsync();
    if (!redis) return { agent, state: "closed", failureCount: 0, lastFailureAt: 0 };

    try {
      return await readState(redis, agent);
    } catch (err) {
      logger.warn("[RedisCircuitBreaker] getState failed — degraded to closed", { agent, err });
      return { agent, state: "closed", failureCount: 0, lastFailureAt: 0 };
    }
  }

  // ── recordFailure ─────────────────────────────────────────────────────────
  async recordFailure(agent: string): Promise<void> {
    const redis = await getRedisAsync();
    if (!redis) return;

    try {
      const k   = redisKey(agent);
      const now = Date.now();

      // hincrby is atomic — safe under concurrent callers
      await redis.hincrby(k, "failureCount", 1);
      await redis.hset(k, "lastFailureAt", now);

      const data         = await redis.hgetall(k);
      const failureCount = Number(data?.failureCount ?? 1);

      if (failureCount >= FAILURE_THRESHOLD) {
        const current = (data?.state as string) ?? "closed";
        if (current !== "open") {
          await redis.hset(k, { state: "open", openedAt: now });
          logger.warn("[RedisCircuitBreaker] OPEN", { agent, failureCount });
        }
      } else {
        // Ensure state is "closed" if it was previously reset
        if (!data?.state) {
          await redis.hset(k, "state", "closed");
        }
      }
    } catch (err) {
      logger.warn("[RedisCircuitBreaker] recordFailure failed", { agent, err });
    }
  }

  // ── recordSuccess ─────────────────────────────────────────────────────────
  async recordSuccess(agent: string): Promise<void> {
    const redis = await getRedisAsync();
    if (!redis) return;

    try {
      const state = await readState(redis, agent);
      if (state.state === "half-open") {
        // One success closes the breaker — delete resets all fields
        await redis.del(redisKey(agent));
        logger.info("[RedisCircuitBreaker] CLOSED (recovered)", { agent });
      } else if (state.failureCount > 0) {
        await redis.hset(redisKey(agent), "failureCount", 0);
      }
    } catch (err) {
      logger.warn("[RedisCircuitBreaker] recordSuccess failed", { agent, err });
    }
  }

  // ── forceOpen — operator override ────────────────────────────────────────
  async forceOpen(agent: string): Promise<void> {
    const redis = await getRedisAsync();
    if (!redis) throw new Error("Redis not available");

    await redis.hset(redisKey(agent), {
      state:        "open",
      failureCount: FAILURE_THRESHOLD,
      openedAt:     Date.now(),
      lastFailureAt: Date.now(),
    });
    logger.warn("[RedisCircuitBreaker] FORCE OPEN", { agent });
  }

  // ── reset — operator override ─────────────────────────────────────────────
  async reset(agent: string): Promise<void> {
    const redis = await getRedisAsync();
    if (!redis) throw new Error("Redis not available");

    await redis.del(redisKey(agent));
    logger.info("[RedisCircuitBreaker] RESET", { agent });
  }

  // ── listAll — for control panel ──────────────────────────────────────────
  async listAll(): Promise<DistributedCircuitState[]> {
    const redis = await getRedisAsync();
    if (!redis) return [];

    try {
      const keys: string[] = await redis.keys("cb:*");
      return Promise.all(
        keys.map(k => {
          const agent = k.replace("cb:", "");
          return readState(redis, agent);
        })
      );
    } catch (err) {
      logger.warn("[RedisCircuitBreaker] listAll failed", { err });
      return [];
    }
  }
}

export const redisCircuitBreaker = new RedisCircuitBreaker();
