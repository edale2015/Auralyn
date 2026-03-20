import { Router, Request, Response } from "express";
import { requireRole } from "../middleware/requireRole";
import { getMetrics, resetMetrics } from "../monitoring/metricsStore";
import { getAuditLog } from "../middleware/auditMiddleware";
import { runHighScaleSimulations } from "../engines/highScaleSimulationEngine";
import { getSystemHealth, getRecentEngineLogs, logEngineStatus } from "../monitoring/systemMonitor";
import { predictFailures } from "../monitoring/predictiveEngine";
import { getLoopStats } from "../system/autonomousLoop";
import { analyzeSystemHealth } from "../controlTower/systemOptimizer";
import { getAllBreakerStates, openAIBreaker, dbBreaker, twilioBreaker, scoringBreaker } from "../utils/circuitBreaker";
import { getModelVersions } from "../engines/unifiedOutcomeLearning";
import { detectDrift, getBaselineSnapshot, getDriftSampleCount, resetBaseline } from "../monitoring/dataDrift";
import { getRecentSnapshots } from "../snapshots/systemSnapshot";
import { checkSLO } from "../monitoring/slo";
import { analyzeFailure } from "../monitoring/rootCauseEngine";
import { runSelfHealing, getLastHealTimes } from "../autonomy/selfHealing";
import { getAutonomyStats } from "../autonomy/autonomyMetrics";
import { getCommandAuditLog } from "../chat/botCommandHandler";

const router = Router();
const auth = requireRole(["admin"]);

router.get("/metrics", auth, (_req: Request, res: Response) => {
  res.json(getMetrics());
});

router.post("/metrics/reset", auth, (_req: Request, res: Response) => {
  resetMetrics();
  res.json({ ok: true });
});

router.get("/audit-log", auth, (req: Request, res: Response) => {
  const limit = Number(req.query.limit || 100);
  res.json(getAuditLog(limit));
});

router.post("/simulate-high-scale", auth, (req: Request, res: Response) => {
  try {
    const perPack = req.body.perPack || 1000;
    const packs = req.body.packs || [
      { id: "demo_cough" },
      { id: "demo_dizziness" },
      { id: "demo_chest_pain" },
    ];
    const results = runHighScaleSimulations(packs, perPack);
    res.json({ ok: true, results });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.get("/health", requireRole(["admin", "physician", "staff"]), async (_req: Request, res: Response) => {
  const health = await getSystemHealth();
  res.json(health);
});

router.get("/health/detailed", auth, async (_req: Request, res: Response) => {
  const [health, prediction] = await Promise.all([getSystemHealth(), predictFailures()]);
  res.json({ health, prediction, autonomousLoop: getLoopStats(), timestamp: new Date().toISOString() });
});

router.get("/engine-logs", auth, async (req: Request, res: Response) => {
  const limit = Number(req.query.limit) || 50;
  res.json(await getRecentEngineLogs(limit));
});

router.post("/engine-log", requireRole(["admin", "physician", "staff"]), async (req: Request, res: Response) => {
  const { engine, status, latencyMs, error } = req.body;
  if (!engine || !status) return res.status(400).json({ error: "engine and status required" });
  await logEngineStatus(engine, status as "healthy" | "error" | "warning", latencyMs ?? 0, error ?? null);
  res.json({ success: true });
});

router.get("/predict-failures", auth, async (_req: Request, res: Response) => {
  res.json(await predictFailures());
});

router.get("/optimizer", requireRole(["admin", "physician"]), async (_req: Request, res: Response) => {
  try {
    const snapshot = await analyzeSystemHealth();
    res.json({ ok: true, ...snapshot });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message });
  }
});

router.get("/circuit-breakers", requireRole(["admin", "physician"]), (_req: Request, res: Response) => {
  res.json({ ok: true, breakers: getAllBreakerStates() });
});

router.post("/circuit-reset", auth, (req: Request, res: Response) => {
  const { name } = req.body;
  const map: Record<string, any> = { openai: openAIBreaker, database: dbBreaker, twilio: twilioBreaker, scoring: scoringBreaker };
  if (name && map[name]) {
    map[name].reset();
    res.json({ ok: true, message: `Circuit breaker '${name}' reset to closed state` });
  } else if (!name) {
    Object.values(map).forEach((b: any) => b.reset());
    res.json({ ok: true, message: "All circuit breakers reset" });
  } else {
    res.status(400).json({ ok: false, error: `Unknown breaker '${name}'. Valid: ${Object.keys(map).join(", ")}` });
  }
});

router.get("/slo", requireRole(["admin", "physician"]), (_req: Request, res: Response) => {
  const metrics = getMetrics() as { p95Latency: number; errorRate: number; totalRequests: number };
  const result = checkSLO({
    p95Latency: metrics.p95Latency,
    errorRate: metrics.errorRate,
    totalRequests: metrics.totalRequests,
  });
  res.json({ ok: true, ...result });
});

router.get("/model-versions", auth, async (req: Request, res: Response) => {
  try {
    const limit = Number(req.query.limit) || 20;
    const versions = await getModelVersions(limit);
    res.json({ ok: true, versions });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message });
  }
});

router.get("/data-drift", requireRole(["admin", "physician"]), async (_req: Request, res: Response) => {
  try {
    const report = await detectDrift();
    res.json({
      ok: true,
      ...report,
      baseline: getBaselineSnapshot(),
      sampleCount: getDriftSampleCount(),
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message });
  }
});

router.post("/data-drift/reset-baseline", auth, (_req: Request, res: Response) => {
  resetBaseline();
  res.json({ ok: true, message: "Drift baseline reset — will re-establish from next 50 patient samples" });
});

router.get("/snapshots", auth, async (req: Request, res: Response) => {
  try {
    const limit = Number(req.query.limit) || 20;
    const snapshots = await getRecentSnapshots(limit);
    res.json({ ok: true, snapshots });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message });
  }
});

router.get("/root-cause", auth, (_req: Request, res: Response) => {
  try {
    const report = analyzeFailure();
    res.json({ ok: true, ...report });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message });
  }
});

router.post("/self-heal", auth, async (_req: Request, res: Response) => {
  try {
    const actions = await runSelfHealing();
    res.json({ ok: true, actionsTriggered: actions.length, actions, lastHealTimes: getLastHealTimes() });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message });
  }
});

router.get("/self-heal/history", auth, (_req: Request, res: Response) => {
  res.json({ ok: true, lastHealTimes: getLastHealTimes() });
});

router.get("/autonomy", requireRole(["admin", "physician"]), async (_req: Request, res: Response) => {
  try {
    const stats = await getAutonomyStats();
    res.json({ ok: true, ...stats });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message });
  }
});

router.get("/bot-audit", auth, (req: Request, res: Response) => {
  const limit = Number(req.query.limit) || 50;
  res.json({ ok: true, log: getCommandAuditLog(limit) });
});

export default router;
