import { Router } from "express";
import { runLoadTest } from "./loadGenerator";
import { analyzeSystem } from "./metricsAnalyzer";
import { requireRole } from "../middleware/requireRole";

const router = Router();

const activeRuns: Record<string, any> = {};

router.post("/run", requireRole(["admin"]), async (req, res) => {
  const { total = 50, concurrency = 10 } = req.body;

  if (total > 500) {
    return res.status(400).json({ error: "Maximum 500 patients per test run" });
  }

  const runId = `stress_${Date.now()}`;
  activeRuns[runId] = { status: "running", startedAt: new Date().toISOString() };

  res.json({ ok: true, runId, message: `Started load test: ${total} patients at concurrency ${concurrency}` });

  runLoadTest(total, concurrency, "http://localhost:5000")
    .then(result => {
      activeRuns[runId] = { status: "complete", result, completedAt: new Date().toISOString() };
      console.log(`[StressTest] Run ${runId} complete: ${result.completed}/${result.total} ok, ${result.avgLatencyMs}ms avg`);
    })
    .catch(e => {
      activeRuns[runId] = { status: "error", error: e?.message };
    });
});

router.post("/run-sync", requireRole(["admin"]), async (req, res) => {
  const { total = 20, concurrency = 5 } = req.body;

  if (total > 100) {
    return res.status(400).json({ error: "Sync run limit: 100 patients" });
  }

  try {
    const result = await runLoadTest(total, concurrency, "http://localhost:5000");
    res.json({ ok: true, result });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message });
  }
});

router.get("/status/:runId", requireRole(["admin"]), (req, res) => {
  const run = activeRuns[req.params.runId];
  if (!run) return res.status(404).json({ error: "Run not found" });
  res.json(run);
});

router.get("/runs", requireRole(["admin"]), (_req, res) => {
  res.json(Object.entries(activeRuns).map(([id, run]) => ({ id, ...run })));
});

router.get("/analyze", requireRole(["admin", "physician"]), async (req, res) => {
  const windowMinutes = parseInt(req.query.window as string) || 60;
  try {
    const metrics = await analyzeSystem(windowMinutes);
    res.json({ ok: true, metrics });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message });
  }
});

export default router;
