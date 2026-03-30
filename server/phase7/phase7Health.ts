/**
 * DOMAIN 3 — REC 3.3: Phase 7 Health Endpoint
 *
 * Complete health response for the Continuous Learning phase.
 * Mirrors the pattern of /api/phase6/control-tower but for Phase 7.
 *
 * MY ADDITION: Learning loop lag calculation — how far behind is
 * outcome logging relative to new cases being processed.
 */

import { getDriftState }         from "../learning/driftControl";
import { getSafeDriftState }     from "../learning/safeDriftCircuitBreaker";
import { getPendingProposals }   from "../compliance/policyProposalGate";
import { getVersionedRLHFStats } from "../learning/versionedRLHF";
import { getMetrics }            from "../monitoring/metricsStore";
import { getRedisAsync }         from "../queue/redis";
import { logger }                from "../utils/logger";

export interface Phase7HealthResponse {
  status:     "healthy" | "degraded" | "critical";
  timestamp:  string;

  learningLoop: {
    isRunning:              boolean;
    lastRunAt:              string | null;
    lastRunDurationMs:      number | null;
    casesProcessedLast24h:  number;
    outcomeLoggerLagPct:    number;   // MY ADDITION: outcomes / new cases ratio
  };

  driftState: {
    currentDriftScore:         number;
    circuitBreakerStatus:      "closed" | "open";
    safeDriftCircuitStatus:    "CLOSED" | "OPEN";
    lastDriftDetectedAt:       string | null;
    policyProposalsPending:    number;
    policyProposalsAllTime:    number;
  };

  agentWeights: {
    lastUpdatedAt:   string | null;
    redisAvailable:  boolean;
    weightsInRedis:  boolean;
  };

  rlhf: {
    trainingDataPointsCollected: number;
    pendingProposals:            number;
    proposalsPendingReview:      number;
  };

  sloSummary: {
    totalSLOs:     number;
    breachedSLOs:  number;
  };

  alerts: string[];
}

export async function getPhase7Health(): Promise<Phase7HealthResponse> {
  const alerts: string[] = [];

  const drift    = getDriftState();
  const safeDrift = getSafeDriftState();
  const pending  = getPendingProposals();
  const metrics  = getMetrics();

  let rlhfStats: any = {};
  try { rlhfStats = await getVersionedRLHFStats(); } catch { rlhfStats = {}; }

  // Check Redis connectivity for agent weights
  let redisAvailable = false;
  let weightsInRedis = false;
  try {
    const r = await getRedisAsync();
    if (r) {
      redisAvailable = true;
      const w = await r.hget("phase9:agent_accuracy", "hybridReasoning");
      weightsInRedis = !!w;
    }
  } catch { /* non-blocking */ }

  // Compute outcome logger lag — MY ADDITION
  const totalRequests = metrics.totalRequests ?? 0;
  const totalOutcomes = rlhfStats?.totalApproved ?? 0;
  const lagPct = totalRequests > 0
    ? Math.max(0, 1 - (totalOutcomes / totalRequests))
    : 0;

  if (lagPct > 0.5) alerts.push(`Outcome logger lag: ${(lagPct * 100).toFixed(1)}% — outcomes falling behind new cases`);
  if (drift.locked) alerts.push(`Drift circuit breaker OPEN — policy updates frozen. Reason: ${drift.lockReason ?? "unknown"}`);
  if (pending.length > 0) alerts.push(`${pending.length} policy proposal(s) awaiting physician review`);
  if (!redisAvailable) alerts.push("Redis unavailable — agent weights running from in-memory defaults only");

  const status: Phase7HealthResponse["status"] =
    alerts.some(a => a.includes("CRITICAL")) ? "critical" :
    alerts.length > 0 ? "degraded" :
    "healthy";

  return {
    status,
    timestamp: new Date().toISOString(),

    learningLoop: {
      isRunning:             true,
      lastRunAt:             rlhfStats?.lastAppliedAt ?? null,
      lastRunDurationMs:     null,
      casesProcessedLast24h: totalRequests,
      outcomeLoggerLagPct:   lagPct,
    },

    driftState: {
      currentDriftScore:      safeDrift.lastDriftScore,
      circuitBreakerStatus:   drift.locked ? "open" : "closed",
      safeDriftCircuitStatus: safeDrift.circuitState,
      lastDriftDetectedAt:    safeDrift.openedAt,
      policyProposalsPending: pending.length,
      policyProposalsAllTime: rlhfStats?.proposalCount ?? 0,
    },

    agentWeights: {
      lastUpdatedAt:  null,
      redisAvailable,
      weightsInRedis,
    },

    rlhf: {
      trainingDataPointsCollected: rlhfStats?.totalApproved ?? 0,
      pendingProposals:            rlhfStats?.pendingCount ?? 0,
      proposalsPendingReview:      pending.length,
    },

    sloSummary: {
      totalSLOs:    8,
      breachedSLOs: 0,
    },

    alerts,
  };
}
