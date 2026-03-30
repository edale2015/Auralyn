/**
 * Phase 9 — Executive Command Dashboard Engine
 *
 * CEO/CTO-level system view aggregating:
 *   - Pipeline v1.2.0 stats (9 stages)
 *   - Agent health from real registry
 *   - Moat scorecard (defensibility grade)
 *   - Predictive failure signals
 *   - Self-healing activity
 *   - Policy evolution mode
 *   - RLHF governance status
 *   - Golden dataset progress toward 50k target
 */

import { getMetrics }            from "../../monitoring/metricsStore";
import { getAgentSummary }       from "../../governance/agentRegistry";
import { getFinalPipelineStats } from "../../clinical/finalPipeline";
import { getVersionedRLHFStats } from "../../learning/versionedRLHF";
import { getDriftState }         from "../../learning/driftControl";
import { getOutcomeStats }       from "../../outcomes/outcomeTracker";
import { getFlywheelStats }      from "../../moat/flywheelEngine";
import { computeMoatScorecard }  from "../../moat/moatMetrics";
import { getPolicyWeights, getCurrentPolicyMode } from "../learning/policyEvolution";
import { getDebateAgentStats }   from "../debate/debateEngine";
import { getNetworkStats }       from "../../moat/networkLearning";
import { predictFailure }        from "../../predictive/predictiveEngine";

export interface ExecutiveSummary {
  systemHealth:     "OPTIMAL" | "STABLE" | "DEGRADED" | "CRITICAL";
  healthScore:      number;     // 0-100
  pipeline:         ReturnType<typeof getFinalPipelineStats>;
  metrics: {
    requests:       number;
    errors:         number;
    errorRate:      number;
    avgLatencyMs:   number;
    p95LatencyMs:   number;
  };
  agents: ReturnType<typeof getAgentSummary>;
  moat: {
    overall:        number;
    grade:          string;
    flywheel:       { totalEncounters: number; velocity24h: number; goldenPromotions: number };
    network:        { activeClinicCount: number; totalNetworkCases: number };
  };
  rlhf: {
    pendingProposals: number;
    approvedVersions: number;
    redisHydrated:    boolean;
    locked:           boolean;
    lockReason?:      string;
  };
  learning: {
    policyMode:     string;
    policyVersion:  number;
    totalOutcomes:  number;
    accuracy:       number;
  };
  debate: {
    agentAccuracies: Record<string, number>;
  };
  predictiveRisk:   ReturnType<typeof predictFailure>;
  alerts:           string[];
  generatedAt:      string;
}

function deriveSystemHealth(errorRate: number, predicted: boolean, driftLocked: boolean): {
  health: ExecutiveSummary["systemHealth"];
  score: number;
} {
  let score = 100;
  const alerts: string[] = [];

  if (driftLocked)    score -= 30;
  if (predicted)      score -= 20;
  if (errorRate > 0.1) score -= 20;
  if (errorRate > 0.2) score -= 20;

  const health = score >= 90 ? "OPTIMAL" : score >= 70 ? "STABLE" : score >= 50 ? "DEGRADED" : "CRITICAL";
  return { health, score: Math.max(0, score) };
}

export async function getExecutiveSummary(): Promise<ExecutiveSummary> {
  const [metrics, agentSummary, pipeline, rlhfStats, drift, outcomes, flyStats, moat, policy, debateStats, netStats, prediction] = await Promise.all([
    Promise.resolve(getMetrics()),
    Promise.resolve(getAgentSummary()),
    Promise.resolve(getFinalPipelineStats()),
    Promise.resolve(getVersionedRLHFStats()),
    Promise.resolve(getDriftState()),
    Promise.resolve(getOutcomeStats()),
    getFlywheelStats(),
    computeMoatScorecard().catch(() => ({ overall: 0, grade: "F", flywheel: { totalEncounters: 0, velocity24h: 0, goldenPromotions: 0 }, network: { activeClinicCount: 0, totalNetworkCases: 0 } } as any)),
    getPolicyWeights(),
    getDebateAgentStats(),
    getNetworkStats(),
    Promise.resolve(predictFailure()),
  ]);

  const { health, score } = deriveSystemHealth(metrics.errorRate, prediction.predicted, drift.locked);

  const policyMode = await getCurrentPolicyMode(policy);

  const alerts: string[] = [];
  if (drift.locked)                    alerts.push(`Drift circuit breaker LOCKED: ${drift.lockReason ?? "performance drop"}`);
  if (prediction.predicted)            alerts.push(`Predictive failure detected: ${prediction.reason}`);
  if (metrics.errorRate > 0.05)        alerts.push(`Error rate elevated: ${(metrics.errorRate * 100).toFixed(1)}%`);
  if (rlhfStats.pendingProposals > 20) alerts.push(`${rlhfStats.pendingProposals} RLHF proposals awaiting physician review`);
  if (moat.overall < 20)               alerts.push("Moat score low — accelerate flywheel data collection");

  return {
    systemHealth: health,
    healthScore:  score,
    pipeline,
    metrics: {
      requests:     metrics.requests ?? 0,
      errors:       metrics.errors ?? 0,
      errorRate:    metrics.errorRate ?? 0,
      avgLatencyMs: metrics.avgLatency ?? 0,
      p95LatencyMs: metrics.p95Latency ?? 0,
    },
    agents: agentSummary,
    moat: {
      overall: moat.overall,
      grade:   moat.grade,
      flywheel: {
        totalEncounters:  flyStats.totalEncounters,
        velocity24h:      flyStats.velocity24h,
        goldenPromotions: flyStats.goldenPromotions,
      },
      network: {
        activeClinicCount:  netStats.activeClinicCount,
        totalNetworkCases:  netStats.totalNetworkCases,
      },
    },
    rlhf: {
      pendingProposals: rlhfStats.pendingProposals,
      approvedVersions: rlhfStats.approvedVersions,
      redisHydrated:    rlhfStats.redisHydrated,
      locked:           drift.locked,
      lockReason:       drift.lockReason,
    },
    learning: {
      policyMode,
      policyVersion: policy.version,
      totalOutcomes: outcomes.total,
      accuracy:      outcomes.accuracy,
    },
    debate: {
      agentAccuracies: debateStats.accuracies,
    },
    predictiveRisk: prediction,
    alerts,
    generatedAt: new Date().toISOString(),
  };
}
