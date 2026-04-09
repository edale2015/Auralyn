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
import { generateExecutiveReport, type ExecutiveInput } from "../executive/aiChiefMedicalOfficer";
import { randomUUID }         from "crypto";

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

// AI CMO narrative report endpoint
router.post("/executive/report", async (req, res) => {
  const traceId = req.headers["x-trace-id"] as string || randomUUID();
  const { input } = req.body as { input?: ExecutiveInput };

  if (!input || typeof input.metrics !== "object") {
    res.status(400).json({ error: "Missing or invalid input.metrics" });
    return;
  }

  try {
    const report = await generateExecutiveReport(input, traceId);
    res.json(report);
  } catch (err) {
    console.error("[ExecutiveRoutes] Report error:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
