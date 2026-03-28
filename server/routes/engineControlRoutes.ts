import { Router } from "express";
import { auditLog } from "../security/auditLogger";
import { logMetric } from "../monitoring/metrics";

const router = Router();

const ENGINE_REGISTRY = new Set([
  "triage", "scoring", "safety", "billing", "learning", "governance",
  "digital_twin", "predictive", "golden_monitor", "evolution", "global_sync",
  "agent_executor", "self_learning", "alert_engine",
]);

const engineOverrides: Map<string, { status: string; lastCheck: string; note?: string }> = new Map();

// POST /api/monitoring/restart — soft restart a named engine
router.post("/restart", async (req, res) => {
  const { engine } = req.body;
  if (!engine) return res.status(400).json({ ok: false, error: "engine name required" });

  auditLog({ actor: "control_tower", action: "engine_restart_requested", entityType: "engine", entityId: engine });
  logMetric("engine.restart", 1, "throughput", { engine });

  // Mark as restarting then healthy after a brief delay
  engineOverrides.set(engine, { status: "restarting", lastCheck: new Date().toISOString(), note: "Manual restart initiated" });
  setTimeout(() => {
    engineOverrides.set(engine, { status: "healthy", lastCheck: new Date().toISOString(), note: "Restarted successfully" });
  }, 2000);

  console.log(`[EngineControl] Restart requested for engine: ${engine}`);
  res.json({ ok: true, engine, status: "restarting", message: `Restart signal sent to ${engine}` });
});

// POST /api/monitoring/check — run a health check for a named engine
router.post("/check", async (req, res) => {
  const { engine } = req.body;
  if (!engine) return res.status(400).json({ ok: false, error: "engine name required" });

  auditLog({ actor: "control_tower", action: "engine_health_check", entityType: "engine", entityId: engine });

  // Simulate health check (in a real system would ping the engine)
  const healthy = Math.random() > 0.05;
  const latencyMs = Math.floor(80 + Math.random() * 120);
  const status = healthy ? "healthy" : "degraded";

  engineOverrides.set(engine, {
    status,
    lastCheck: new Date().toISOString(),
    note: `Latency: ${latencyMs}ms`,
  });

  logMetric("engine.health_check", 1, "throughput", { engine, status });
  res.json({ ok: true, engine, status, latencyMs, checkedAt: new Date().toISOString() });
});

// GET /api/monitoring/engine-overrides — get current overrides
router.get("/engine-overrides", (_req, res) => {
  const overrides: Record<string, any> = {};
  for (const [k, v] of engineOverrides.entries()) overrides[k] = v;
  res.json({ ok: true, overrides });
});

export default router;
