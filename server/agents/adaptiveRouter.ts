// ── Adaptive Router ────────────────────────────────────────────────────────────
//
// Selects the best-scoring agent from (primary + fallbacks) based on live Redis
// health scores. Gracefully returns the primary when health data is unavailable.

import { selfHealingEngine } from "./selfHealingEngine";
import { logger }             from "../utils/logger";

export class AdaptiveRouter {

  /**
   * Given a primary agent name and ordered fallbacks, returns the name of the
   * highest-scoring agent. Primary is preferred on ties.
   */
  async pickAgent(primary: string, fallbacks: string[] = []): Promise<string> {
    const candidates = [primary, ...fallbacks];
    if (candidates.length === 1) return primary;

    try {
      const scores = await Promise.all(candidates.map(a => selfHealingEngine.getHealth(a)));

      // Sort descending by score; ties keep original order (primary first)
      scores.sort((a, b) => b.score - a.score);

      const picked = scores[0].agent;
      if (picked !== primary) {
        logger.info("[AdaptiveRouter] Rerouted", { from: primary, to: picked, score: scores[0].score });
      }
      return picked;
    } catch (err) {
      logger.warn("[AdaptiveRouter] pickAgent failed — using primary", { primary, err });
      return primary;
    }
  }
}

export const adaptiveRouter = new AdaptiveRouter();
