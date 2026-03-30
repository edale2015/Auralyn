/**
 * Phase 6 — Control Tower Feed
 *
 * Lightweight system snapshot for the executive / control tower view.
 * Pulls from the real metrics store, agent registry, and drift state
 * so it reflects live system health rather than static values.
 */

import { getMetrics }     from "../../monitoring/metricsStore";
import { getAgentSummary } from "../../governance/agentRegistry";
import { getDriftState }  from "../../learning/driftControl";
import { predictFailure } from "../../predictive/predictiveEngine";

export function getControlTowerData() {
  const metrics      = getMetrics();
  const agents       = getAgentSummary();
  const drift        = getDriftState();
  const prediction   = predictFailure();

  return {
    status:    drift.locked ? "degraded" : "ok",
    uptime:    process.uptime(),
    timestamp: Date.now(),
    metrics: {
      requests:     metrics.requests,
      errors:       metrics.errors,
      errorRate:    metrics.errorRate,
      avgLatencyMs: metrics.avgLatency,
    },
    agents: {
      total:    agents.total,
      healthy:  agents.healthy,
      warning:  agents.warning,
      critical: agents.critical,
    },
    drift: {
      locked:     drift.locked,
      lockReason: drift.lockReason ?? null,
    },
    predictive: {
      riskDetected: prediction.predicted,
      reason:       prediction.reason,
      confidence:   prediction.confidence,
    },
  };
}
