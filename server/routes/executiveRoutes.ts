/**
 * Executive System Routes
 *
 * GET /api/executive — compact system overview for executive tooling
 *   (lightweight alternative to /api/phase9/executive for health checks
 *    and external dashboards)
 */

import { Router }             from "express";
import { getMetrics }         from "../monitoring/metricsStore";
import { getDriftState }      from "../learning/driftControl";
import { getAgentSummary }    from "../governance/agentRegistry";

const router = Router();

router.get("/executive", (_req, res) => {
  const m     = getMetrics();
  const drift = getDriftState();
  const a     = getAgentSummary();

  return res.json({
    system:       "Auralyn Med-Scribe AI",
    version:      "pipeline-v1.2.0",
    status:       drift.locked ? "degraded" : "operational",
    uptime:       process.uptime(),
    requests:     m.requests,
    errorRate:    m.errorRate,
    avgLatencyMs: m.avgLatency,
    agents:       a,
    driftLocked:  drift.locked,
    timestamp:    new Date().toISOString(),
  });
});

export default router;
