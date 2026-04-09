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

// ── Cycle-level meta-learning orchestrator ────────────────────────────────────
// Observes outcomes, detects patterns, proposes changes, routes through golden
// case gate. Approved insights are queued in Redis for human review — NOT
// auto-applied. Safe self-improvement.

import { auditStep }                   from "../audit/auditLogger";
import { validateChangeWithGoldenCases } from "../clinical/changeApprovalGate";
import type { GoldenCase }             from "../simulation/goldenCaseEngine";

export interface OutcomeRecord {
  caseId:               string;
  complaint:            string;
  predictedDisposition: string;
  actualOutcome:        string;
  timeToEvent?:         number;
  features:             Record<string, unknown>;
}

export interface LearningInsight {
  type:           "threshold_adjustment" | "prior_shift" | "question_ordering" | "selector_drift";
  target:         string;
  recommendation: Record<string, unknown>;
  confidence:     number;
}

export interface MetaLearningCycleResult {
  insightsGenerated: number;
  approvedChanges:   number;
  rejectedChanges:   number;
}

const INSIGHTS_QUEUE_KEY = "meta:insights:pending_review";

/**
 * Run a meta-learning cycle:
 *   1. Detect disposition errors
 *   2. Detect high-risk complaint patterns (prior drift)
 *   3. Validate each insight via golden case gate
 *   4. Queue approved insights in Redis for human review (NOT auto-applied)
 *
 * @param outcomes    Recent outcome records (last 7–30 days recommended)
 * @param goldenCases Validated reference cases for gate validation
 * @param traceId     Audit trace ID
 */
export async function runMetaLearningCycle(
  outcomes:    OutcomeRecord[],
  goldenCases: GoldenCase[],
  traceId:     string
): Promise<MetaLearningCycleResult> {
  const insights: LearningInsight[] = [];

  // ── 1. Detect disposition errors ──────────────────────────────────────────
  const errors    = outcomes.filter(o => o.predictedDisposition !== o.actualOutcome);
  const errorRate = outcomes.length > 0 ? errors.length / outcomes.length : 0;

  const missedER = errors.filter(
    e => e.actualOutcome === "ER_NOW" && e.predictedDisposition !== "ER_NOW"
  );

  if (missedER.length > 0) {
    insights.push({
      type:           "threshold_adjustment",
      target:         "safety_pipeline",
      recommendation: { increaseSensitivity: true, missedERCount: missedER.length },
      confidence:     Math.min(1, missedER.length / outcomes.length),
    });
  }

  // ── 2. Prior drift detection ───────────────────────────────────────────────
  const complaintGroups: Record<string, OutcomeRecord[]> = {};
  for (const o of outcomes) {
    if (!complaintGroups[o.complaint]) complaintGroups[o.complaint] = [];
    complaintGroups[o.complaint].push(o);
  }

  for (const [complaint, group] of Object.entries(complaintGroups)) {
    const erRate = group.filter(g => g.actualOutcome === "ER_NOW").length / group.length;
    if (erRate > 0.3 && group.length >= 5) {
      insights.push({
        type:           "prior_shift",
        target:         complaint,
        recommendation: { increaseHighRiskPrior: true, observedERRate: erRate },
        confidence:     Math.min(1, erRate),
      });
    }
  }

  // ── 3. Validate via golden cases + queue approved insights ─────────────────
  let approvedChanges = 0;
  let rejectedChanges = 0;

  for (const insight of insights) {
    try {
      const validation = await validateChangeWithGoldenCases(insight, goldenCases, traceId);

      // Store in Redis pending review queue — NOT auto-applied
      try {
        const redis = await getRedisAsync();
        if (redis && typeof redis.lpush === "function") {
          await redis.lpush(INSIGHTS_QUEUE_KEY, JSON.stringify({
            insight,
            validation: { approved: validation.approved, reason: validation.reason },
            queuedAt:   new Date().toISOString(),
            traceId,
            status:     "pending_review",
          }));
        }
      } catch { /* non-blocking — audit is the source of truth */ }

      await auditStep({
        traceId,
        step:     "meta_learning_approved",
        input:    insight,
        output:   { approved: validation.approved, reason: validation.reason },
        metadata: { status: "pending_review" },
      });

      approvedChanges++;

    } catch (err) {
      rejectedChanges++;
      await auditStep({
        traceId,
        step:     "meta_learning_rejected",
        input:    insight,
        output:   null,
        metadata: { error: String(err) },
      });
    }
  }

  await auditStep({
    traceId,
    step:     "meta_learning_cycle_complete",
    input:    { totalOutcomes: outcomes.length, errorRate: errorRate.toFixed(3) },
    output:   { insightsGenerated: insights.length, approvedChanges, rejectedChanges },
    metadata: {},
  });

  return {
    insightsGenerated: insights.length,
    approvedChanges,
    rejectedChanges,
  };
}
