/**
 * Phase 9 — Continuous Learning Pipeline
 *
 * Wired to the real outcomeTracker. Applies temporal decay (EMA α=0.1)
 * so stale clinical patterns don't corrupt current policy — Recommendation #4.
 *
 * Flow:
 *   1. Fetch recent outcomes from outcomeTracker
 *   2. Compute accuracy per diagnosis
 *   3. Propose weight updates to versionedRLHF (human-gated — never autonomous)
 *   4. Return learning summary
 */

import { getOutcomes, getOutcomeStats } from "../../outcomes/outcomeTracker";
import { proposeWeightUpdate, getPendingProposals, getVersionedRLHFStats } from "../../learning/versionedRLHF";
import { canLearn }       from "../../release/modelFreeze";
import { isLocked }       from "../../learning/driftControl";
import { getRedisAsync }  from "../../queue/redis";

const REDIS_EMA_KEY = "phase9:ema_accuracy"; // hash: diagnosis → ema

const EMA_ALPHA = 0.1; // temporal decay — Recommendation #4

export interface LearningRunResult {
  ran:              boolean;
  blockedReason?:   string;
  totalCases:       number;
  accuracy:         number;
  diagnosisAccuracy: Record<string, { correct: number; total: number; ema: number }>;
  proposalsCreated: number;
  pendingProposals: number;
  rlhfStats:        any;
  ranAt:            string;
}

async function getEma(dx: string): Promise<number> {
  const r = await getRedisAsync();
  if (!r) return 0.5;
  try {
    const v = await r.hget(REDIS_EMA_KEY, dx);
    return v ? parseFloat(v as string) : 0.5;
  } catch { return 0.5; }
}

async function updateEma(dx: string, correct: boolean): Promise<number> {
  const curr = await getEma(dx);
  const updated = curr * (1 - EMA_ALPHA) + (correct ? 1 : 0) * EMA_ALPHA;
  const r = await getRedisAsync();
  if (r) {
    try { await r.hset(REDIS_EMA_KEY, { [dx]: updated.toFixed(4) }); } catch { /* non-blocking */ }
  }
  return updated;
}

export async function runContinuousLearning(): Promise<LearningRunResult> {
  /* Safety gates — Recommendation #3 (drift integration) */
  if (!canLearn()) {
    return {
      ran: false, blockedReason: "Model is frozen (model freeze flag)",
      totalCases: 0, accuracy: 0, diagnosisAccuracy: {}, proposalsCreated: 0,
      pendingProposals: getPendingProposals().length, rlhfStats: getVersionedRLHFStats(), ranAt: new Date().toISOString(),
    };
  }

  if (isLocked()) {
    return {
      ran: false, blockedReason: "Model locked by drift circuit breaker",
      totalCases: 0, accuracy: 0, diagnosisAccuracy: {}, proposalsCreated: 0,
      pendingProposals: getPendingProposals().length, rlhfStats: getVersionedRLHFStats(), ranAt: new Date().toISOString(),
    };
  }

  const outcomes = getOutcomes();
  if (outcomes.length === 0) {
    return {
      ran: false, blockedReason: "No outcomes recorded yet",
      totalCases: 0, accuracy: 0, diagnosisAccuracy: {}, proposalsCreated: 0,
      pendingProposals: getPendingProposals().length, rlhfStats: getVersionedRLHFStats(), ranAt: new Date().toISOString(),
    };
  }

  /* Aggregate per-diagnosis accuracy */
  const perDx: Record<string, { correct: number; total: number }> = {};
  for (const o of outcomes) {
    const dx = o.predictedDiagnosis;
    if (!perDx[dx]) perDx[dx] = { correct: 0, total: 0 };
    perDx[dx].total++;
    if (o.correct) perDx[dx].correct++;
  }

  /* Apply EMA and propose weight updates for underperforming diagnoses */
  const diagnosisAccuracy: Record<string, { correct: number; total: number; ema: number }> = {};
  let proposalsCreated = 0;

  for (const [dx, stat] of Object.entries(perDx)) {
    const recentCorrect = stat.total > 0 ? stat.correct / stat.total : 0;
    const ema = await updateEma(dx, recentCorrect > 0.5);
    diagnosisAccuracy[dx] = { ...stat, ema };

    /* Propose downward weight adjustment for consistently poor performers */
    if (ema < 0.5 && stat.total >= 5) {
      proposeWeightUpdate({
        diagnosisKey: dx,
        delta:        -0.05,
        rationale:    `Continuous learning: EMA accuracy ${(ema * 100).toFixed(1)}% across ${stat.total} cases — below threshold`,
        proposedBy:   "phase9_continuous_learning",
        outcome:      "ema_below_threshold",
      });
      proposalsCreated++;
    }

    /* Propose upward weight for strong performers */
    if (ema > 0.85 && stat.total >= 10) {
      proposeWeightUpdate({
        diagnosisKey: dx,
        delta:        0.03,
        rationale:    `Continuous learning: EMA accuracy ${(ema * 100).toFixed(1)}% across ${stat.total} cases — above threshold`,
        proposedBy:   "phase9_continuous_learning",
        outcome:      "ema_above_threshold",
      });
      proposalsCreated++;
    }
  }

  const stats = getOutcomeStats();

  return {
    ran:              true,
    totalCases:       stats.total,
    accuracy:         stats.accuracy,
    diagnosisAccuracy,
    proposalsCreated,
    pendingProposals: getPendingProposals().length,
    rlhfStats:        getVersionedRLHFStats(),
    ranAt:            new Date().toISOString(),
  };
}
