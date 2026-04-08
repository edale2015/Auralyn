/**
 * councilActivationBandit.ts
 * Decides which specialist councils to activate for a given clinical encounter.
 *
 * Activation modes:
 *   "heuristic" → rule-based on symptom/presentation patterns (always available)
 *   "bandit"    → UCB-based, learns from feedback which councils add value
 *   "hybrid"    → heuristic first, bandit for borderline cases
 *
 * The bandit learns which councils improve diagnostic accuracy over time.
 * Reward (+1) is recorded when a council's recommendation matches physician review.
 * Penalty (-1) is recorded when a council adds noise (high disagreement, no benefit).
 */

import { getRedisAsync } from "../queue/redis";

const KEY_PREFIX = "council:bandit";

export type ActivationMode = "heuristic" | "bandit" | "hybrid";

export type SpecialtyCouncil = "cardiology" | "infectious_disease" | "icu";

export interface ActivationContext {
  symptoms:      string[];
  answers:       Record<string, any>;
  riskScore?:    number;
  riskLevel?:    string;
  redFlags?:     string[];
}

export class CouncilActivationBandit {

  private mode: ActivationMode;

  constructor(mode: ActivationMode = "hybrid") {
    this.mode = mode;
  }

  async shouldActivate(
    council:  SpecialtyCouncil,
    ctx:      ActivationContext,
  ): Promise<boolean> {
    if (this.mode === "heuristic") {
      return this.heuristicShouldActivate(council, ctx);
    }
    if (this.mode === "bandit") {
      return this.banditShouldActivate(council, ctx);
    }
    const heuristic = this.heuristicShouldActivate(council, ctx);
    if (heuristic) return true;
    return this.banditShouldActivate(council, ctx);
  }

  private heuristicShouldActivate(council: SpecialtyCouncil, ctx: ActivationContext): boolean {
    const symsStr  = ctx.symptoms.join(" ").toLowerCase();
    const answers  = ctx.answers ?? {};
    const redFlags = (ctx.redFlags ?? []).join(" ").toLowerCase();

    switch (council) {
      case "cardiology":
        return (
          /chest\s*pain|palpitation|syncope|cardiac|heart|arrhythmia/i.test(symsStr) ||
          /chest\s*pain|cardiac|mi|acs/i.test(redFlags) ||
          answers.chestPain === true ||
          (ctx.riskScore ?? 0) > 0.6
        );

      case "infectious_disease":
        return (
          /fever|sepsis|infection|pneumonia|uti|cellulitis|meningitis/i.test(symsStr) ||
          /sepsis|fever/i.test(redFlags) ||
          answers.fever === true ||
          answers.chills === true ||
          (Number(ctx.answers?.temperature ?? 37) > 38.5)
        );

      case "icu":
        return (
          (ctx.riskScore ?? 0) >= 0.80 ||
          ctx.riskLevel === "high" ||
          /altered\s*mental|shock|respiratory\s*failure|septic/i.test(symsStr) ||
          /sepsis|shock|respiratory/i.test(redFlags) ||
          answers.alteredMental === true
        );
    }
  }

  private async banditShouldActivate(council: SpecialtyCouncil, _ctx: ActivationContext): Promise<boolean> {
    try {
      const redis = await getRedisAsync();
      if (!redis) return false;

      const key  = `${KEY_PREFIX}:${council}`;
      let data: Record<string, string> = {};
      if (typeof redis.hgetall === "function") {
        data = (await redis.hgetall(key)) ?? {};
      }

      const count  = Number(data.count  ?? 0);
      const reward = Number(data.reward ?? 0);

      if (count < 5) return false;

      const ucbScore = (reward / count) + Math.sqrt(Math.log(count + 1) / count);
      return ucbScore > 0.5;
    } catch {
      return false;
    }
  }

  async recordFeedback(council: SpecialtyCouncil, helpful: boolean): Promise<void> {
    try {
      const redis = await getRedisAsync();
      if (!redis) return;

      const key = `${KEY_PREFIX}:${council}`;
      if (typeof redis.hincrby === "function") {
        await redis.hincrby(key, "count", 1);
      }
      if (typeof redis.hincrbyfloat === "function") {
        await redis.hincrbyfloat(key, "reward", helpful ? 1 : -1);
      }
    } catch {
    }
  }

  async getStats(): Promise<Record<SpecialtyCouncil, { count: number; reward: number; ucb: number }>> {
    const councils: SpecialtyCouncil[] = ["cardiology", "infectious_disease", "icu"];
    const result: any = {};

    try {
      const redis = await getRedisAsync();

      for (const c of councils) {
        let data: Record<string, string> = {};
        if (redis && typeof redis.hgetall === "function") {
          data = (await redis.hgetall(`${KEY_PREFIX}:${c}`)) ?? {};
        }
        const count  = Number(data.count  ?? 0);
        const reward = Number(data.reward ?? 0);
        const ucb    = count > 0 ? (reward / count) + Math.sqrt(Math.log(count + 1) / count) : 0;
        result[c] = { count, reward, ucb };
      }
    } catch {
      for (const c of councils) result[c] = { count: 0, reward: 0, ucb: 0 };
    }

    return result;
  }
}

export const councilActivationBandit = new CouncilActivationBandit("hybrid");
