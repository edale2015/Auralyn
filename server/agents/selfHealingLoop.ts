// ── Self-Healing Loop ──────────────────────────────────────────────────────────
//
// Background loop (30-second interval) that:
//   1. Reads all agent health scores from Redis.
//   2. Adjusts routing weights for degraded agents.
//   3. Logs agents whose score has fallen below zero (active harm risk).
//
// Timer is .unref()'d — does not block test process exit.
// idempotent: calling startSelfHealingLoop() twice is safe.

import { selfHealingEngine } from "./selfHealingEngine";
import { weightAdapter }      from "./weightAdapter";
import { logger }             from "../utils/logger";

const LOOP_INTERVAL_MS = 30_000;

let _timer: ReturnType<typeof setInterval> | null = null;

export function startSelfHealingLoop(): void {
  if (_timer) return;

  _timer = setInterval(async () => {
    try {
      const agents = await selfHealingEngine.getAllAgentsHealth();

      for (const a of agents) {
        await weightAdapter.adjust(a.agent);

        if (a.score < 0) {
          logger.warn("[SelfHealingLoop] Agent degraded below zero", {
            agent:       a.agent,
            score:       a.score,
            successRate: a.successRate,
            timeouts:    a.timeouts,
          });
        }
      }
    } catch (err) {
      logger.warn("[SelfHealingLoop] cycle error", { err });
    }
  }, LOOP_INTERVAL_MS).unref();
}

export function stopSelfHealingLoop(): void {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
  }
}
