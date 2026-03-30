/**
 * DOMAIN 3 — REC 3.3: Phase 7 Health Endpoint
 *
 * CLAUDE REVIEW ADDITIONS (Round 2):
 *   - lastKnownGoodPolicy — rollback reference for emergency use
 *   - demographicMonitor — parity analysis summary in health response
 *   - SLO total count updated to reflect new SLOs
 */

import { getDriftState }         from "../learning/driftControl";
import { getSafeDriftState }     from "../learning/safeDriftCircuitBreaker";
import { getPendingProposals }   from "../compliance/policyProposalGate";
import { getVersionedRLHFStats } from "../learning/versionedRLHF";
import { getMetrics }            from "../monitoring/metricsStore";
import { getRedisAsync }         from "../queue/redis";
import { getSLOStatuses, CLINICAL_SLOS } from "../observability/clinicalSLOs";
import { computeParityAnalysis } from "../learning/demographicDriftMonitor";
import { logger }                from "../utils/logger";
import type { PolicyMode }       from "../compliance/policyProposalGate";

export interface Phase7HealthResponse {
  status:     "healthy" | "degraded" | "critical";
  timestamp:  string;

  learningLoop: {
    isRunning:              boolean;
    lastRunAt:              string | null;
    lastRunDurationMs:      number | null;
    casesProcessedLast24h:  number;
    outcomeLoggerLagPct:    number;
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
    totalSLOs:    number;
    breachedSLOs: number;
  };

  // Claude rec: last known good policy for emergency rollback reference
  lastKnownGoodPolicy: {
    mode:       PolicyMode;
    promotedAt: string;
    promotedBy: string;
  } | null;

  // Claude rec: demographic monitor summary
  demographicMonitor: {
    lastAnalysisAt:    string | null;
    flaggedGroups:     string[];
    maxParityDelta:    number;
    groupsWithMinData: number;
    overDischargeRisk: Array<{ group: string; riskScore: number; flagged: boolean }>;
  };

  alerts: string[];
}

export async function getPhase7Health(): Promise<Phase7HealthResponse> {
  const alerts: string[] = [];

  const drift     = getDriftState();
  const safeDrift = getSafeDriftState();
  const pending   = getPendingProposals();
  const metrics   = getMetrics();

  let rlhfStats: any = {};
  try { rlhfStats = await getVersionedRLHFStats(); } catch { rlhfStats = {}; }

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

  const totalRequests = metrics.totalRequests ?? 0;
  const totalOutcomes = rlhfStats?.totalApproved ?? 0;
  const lagPct = totalRequests > 0 ? Math.max(0, 1 - (totalOutcomes / totalRequests)) : 0;

  // SLO summary
  let breachedSLOs = 0;
  try {
    const sloStatuses = getSLOStatuses();
    breachedSLOs = sloStatuses.filter(s => s.breached).length;
  } catch { /* non-blocking */ }

  // Demographic monitor summary
  let demographicMonitor: Phase7HealthResponse["demographicMonitor"] = {
    lastAnalysisAt: null,
    flaggedGroups: [],
    maxParityDelta: 0,
    groupsWithMinData: 0,
    overDischargeRisk: [],
  };
  try {
    const parity = computeParityAnalysis();
    demographicMonitor = {
      lastAnalysisAt:    parity.analysisAt,
      flaggedGroups:     parity.flaggedGroups,
      maxParityDelta:    parity.maxDelta,
      groupsWithMinData: parity.groupParityResults.length,
      overDischargeRisk: parity.overDischargeRisk,
    };
    if (parity.flaggedGroups.length > 0) {
      alerts.push(`Demographic parity breach: groups [${parity.flaggedGroups.join(", ")}] exceed 5% ER_NOW disparity`);
    }
    if (parity.overDischargeRisk.filter(g => g.flagged).length > 0) {
      alerts.push(`Over-discharge risk detected in groups: [${parity.overDischargeRisk.filter(g => g.flagged).map(g => g.group).join(", ")}]`);
    }
  } catch { /* non-blocking */ }

  if (lagPct > 0.5) alerts.push(`Outcome logger lag: ${(lagPct * 100).toFixed(1)}% — outcomes falling behind new cases`);
  if (drift.locked) alerts.push(`Drift circuit breaker OPEN — policy updates frozen. Reason: ${drift.lockReason ?? "unknown"}`);
  if (pending.length > 0) alerts.push(`${pending.length} policy proposal(s) awaiting physician review`);
  if (!redisAvailable) alerts.push("Redis unavailable — agent weights running from in-memory defaults only");
  if (breachedSLOs > 0) alerts.push(`${breachedSLOs} clinical SLO(s) currently breached`);

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
      totalSLOs:    CLINICAL_SLOS.length,
      breachedSLOs,
    },

    lastKnownGoodPolicy: null,

    demographicMonitor,

    alerts,
  };
}
