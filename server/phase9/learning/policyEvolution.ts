/**
 * Phase 9 — Outcome-Driven Policy Evolution
 *
 * Policy weights evolve based on real outcome data:
 *   - "conservative"  → increases when AI misses are flagged (false negatives)
 *   - "aggressive"    → increases when over-escalation is detected
 *   - "probabilistic" → increases when Bayesian-only predictions outperform
 *
 * Wired to driftControl — Recommendation #3:
 * If the drift circuit breaker is locked, policy evolution is frozen.
 *
 * Redis-persisted so policy survives restarts.
 */

import { getOutcomes }    from "../../outcomes/outcomeTracker";
import { isLocked, getDriftState } from "../../learning/driftControl";
import { getRedisAsync }  from "../../queue/redis";

const REDIS_POLICY_KEY   = "phase9:policy_weights";
const REDIS_EVOLUTION_KEY = "phase9:policy_evolution_history";

export interface PolicyWeights {
  conservative:  number;  // bias toward ER escalation
  balanced:      number;  // standard hybrid weighting
  probabilistic: number;  // lean on Bayesian engine
  updatedAt:     string;
  version:       number;
}

const DEFAULT_WEIGHTS: PolicyWeights = {
  conservative:  1.0,
  balanced:      1.0,
  probabilistic: 1.0,
  updatedAt:     new Date().toISOString(),
  version:       1,
};

export async function getPolicyWeights(): Promise<PolicyWeights> {
  const r = await getRedisAsync();
  if (!r) return { ...DEFAULT_WEIGHTS };
  try {
    const raw = await r.get(REDIS_POLICY_KEY);
    return raw ? (typeof raw === "string" ? JSON.parse(raw) : raw) : { ...DEFAULT_WEIGHTS };
  } catch { return { ...DEFAULT_WEIGHTS }; }
}

async function savePolicyWeights(w: PolicyWeights): Promise<void> {
  const r = await getRedisAsync();
  if (!r) return;
  try { await r.set(REDIS_POLICY_KEY, JSON.stringify(w)); } catch { /* non-blocking */ }
}

export interface PolicyEvolutionResult {
  evolved:         boolean;
  blockedReason?:  string;
  before:          PolicyWeights;
  after:           PolicyWeights;
  deltaConservative: number;
  deltaBalanced:     number;
  deltaProbabilistic: number;
  totalCasesAnalyzed: number;
  evolvedAt:       string;
}

export async function evolvePolicy(): Promise<PolicyEvolutionResult> {
  const before = await getPolicyWeights();
  const evolvedAt = new Date().toISOString();

  /* Drift integration — Recommendation #3 */
  if (isLocked()) {
    return {
      evolved: false, blockedReason: "Policy evolution blocked: drift circuit breaker is locked",
      before, after: before, deltaConservative: 0, deltaBalanced: 0, deltaProbabilistic: 0,
      totalCasesAnalyzed: 0, evolvedAt,
    };
  }

  const outcomes = getOutcomes();
  if (outcomes.length < 10) {
    return {
      evolved: false, blockedReason: `Insufficient outcomes (${outcomes.length}/10 minimum)`,
      before, after: before, deltaConservative: 0, deltaBalanced: 0, deltaProbabilistic: 0,
      totalCasesAnalyzed: outcomes.length, evolvedAt,
    };
  }

  const after = { ...before, updatedAt: evolvedAt, version: before.version + 1 };

  for (const o of outcomes) {
    if (!o.correct) {
      /* Missed diagnosis → be more conservative (escalate more readily) */
      after.conservative = Math.min(3.0, after.conservative + 0.05);
    } else {
      /* Correct prediction → probabilistic approach is working */
      after.probabilistic = Math.min(3.0, after.probabilistic + 0.02);
      /* Avoid over-escalation if we're being too conservative */
      if (after.conservative > 1.5) {
        after.conservative = Math.max(1.0, after.conservative - 0.01);
      }
    }
    /* Balanced always regresses toward 1.0 slowly */
    after.balanced = after.balanced * 0.999 + 1.0 * 0.001;
  }

  /* Normalize so weights sum to 3 */
  const sum = after.conservative + after.balanced + after.probabilistic;
  after.conservative  = parseFloat(((after.conservative  / sum) * 3).toFixed(4));
  after.balanced      = parseFloat(((after.balanced      / sum) * 3).toFixed(4));
  after.probabilistic = parseFloat(((after.probabilistic / sum) * 3).toFixed(4));

  await savePolicyWeights(after);

  /* Persist evolution event to history (capped at 100) */
  const r = await getRedisAsync();
  if (r) {
    try {
      await r.lpush(REDIS_EVOLUTION_KEY, JSON.stringify({
        version: after.version, before, after, casesAnalyzed: outcomes.length, evolvedAt,
      }));
      await r.ltrim(REDIS_EVOLUTION_KEY, 0, 99);
    } catch { /* non-blocking */ }
  }

  return {
    evolved: true,
    before,
    after,
    deltaConservative:   parseFloat((after.conservative  - before.conservative).toFixed(4)),
    deltaBalanced:       parseFloat((after.balanced      - before.balanced).toFixed(4)),
    deltaProbabilistic:  parseFloat((after.probabilistic - before.probabilistic).toFixed(4)),
    totalCasesAnalyzed: outcomes.length,
    evolvedAt,
  };
}

export async function getPolicyHistory(): Promise<any[]> {
  const r = await getRedisAsync();
  if (!r) return [];
  try {
    const items = await r.lrange(REDIS_EVOLUTION_KEY, 0, 19);
    return items.map(i => typeof i === "string" ? JSON.parse(i) : i);
  } catch { return []; }
}

export async function getCurrentPolicyMode(weights: PolicyWeights): Promise<string> {
  const { conservative, balanced, probabilistic } = weights;
  if (conservative > balanced && conservative > probabilistic) return "CONSERVATIVE";
  if (probabilistic > balanced && probabilistic > conservative) return "PROBABILISTIC";
  return "BALANCED";
}
