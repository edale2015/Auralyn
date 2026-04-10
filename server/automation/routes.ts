import { Router } from "express";
import {
  runAutomation,
  getAutomationRunDetail,
  listRuns,
  listApprovals,
  approveRunCheckpoint,
  rejectRunCheckpoint,
  listAutomationTemplates,
} from "./automationService";
import healthRouter from "./healthRoutes";

const router = Router();

router.use("/", healthRouter);

// ── LLM template generation ───────────────────────────────────────────────────

router.post("/generate", async (req, res) => {
  try {
    const { prompt } = req.body || {};
    if (!prompt?.trim()) {
      return res.status(400).json({ error: "prompt is required" });
    }
    const { generateTemplateFromPrompt } = await import("./llmTemplateGenerator");
    const result = await generateTemplateFromPrompt(String(prompt));
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "LLM generation failed" });
  }
});

// ── Template DNA (selector lineage + scores + history) ────────────────────────

router.get("/dna/:key", async (req, res) => {
  try {
    const key = req.params.key;
    const { getTemplateScores } = await import("./selectorScore");
    const { getTemplateHistory }                    = await import("./templateStore");
    const { getMetrics }                            = await import("./metricsTracker");

    const [scores, history, metrics] = await Promise.all([
      getTemplateScores(key).catch(() => []),
      getTemplateHistory(key, 10).catch(() => []),
      Promise.resolve(getMetrics()),
    ]);

    const brokenCount = scores.filter((s: any) => s.confidence < 0.5).length;
    const healed      = scores.reduce((sum: number, s: any) => sum + (s.healed_count ?? 0), 0);

    const tmplMetrics = metrics.byTemplate[key];
    const successRate = tmplMetrics && tmplMetrics.runs > 0
      ? `${(((tmplMetrics.runs - tmplMetrics.failures) / tmplMetrics.runs) * 100).toFixed(1)}%`
      : null;

    res.json({
      templateKey:    key,
      selectorScores: scores,
      history,
      broken:         brokenCount,
      healed,
      totalRuns:      tmplMetrics?.runs ?? 0,
      successRate,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "DNA fetch failed" });
  }
});

// ── Region routing probe ──────────────────────────────────────────────────────

router.get("/routing/probe", async (_req, res) => {
  try {
    const { pickWorkerRegion, listRegions, getRegionEndpoint } = await import("./routingStrategy");
    const regions = listRegions();

    // Quick latency check — race to /api/automation/metrics on each endpoint
    const latencies: Record<string, number | null> = {};
    await Promise.all(
      regions.map(async (r) => {
        const start = Date.now();
        try {
          const ctrl  = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 2_500);
          await fetch(`${getRegionEndpoint(r)}/api/automation/metrics`, { signal: ctrl.signal });
          clearTimeout(timer);
          latencies[r] = Date.now() - start;
        } catch {
          latencies[r] = null;
        }
      })
    );

    const best = await pickWorkerRegion().catch(() => "dev");
    res.json({ latencies, recommended: best });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Probe failed" });
  }
});

router.get("/templates", async (_req, res) => {
  res.json(listAutomationTemplates());
});

router.post("/run", async (req, res) => {
  try {
    const run = await runAutomation({
      templateKey: req.body.templateKey,
      payload: req.body.payload || {},
      clinicId: req.body.clinicId,
      startedBy: req.body.startedBy,
      traceId: (req as any).traceId,
    });
    res.json(run);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Automation failed" });
  }
});

router.get("/runs", async (_req, res) => {
  const rows = await listRuns();
  res.json(rows);
});

router.get("/runs/:runId", async (req, res) => {
  const detail = await getAutomationRunDetail(req.params.runId);
  res.json(detail);
});

router.get("/approvals", async (_req, res) => {
  const rows = await listApprovals();
  res.json(rows);
});

router.post("/approvals/:approvalId/approve", async (req, res) => {
  const row = await approveRunCheckpoint(
    req.params.approvalId,
    req.body?.decidedBy,
    req.body?.notes
  );
  res.json(row);
});

router.post("/approvals/:approvalId/reject", async (req, res) => {
  const row = await rejectRunCheckpoint(
    req.params.approvalId,
    req.body?.decidedBy,
    req.body?.notes
  );
  res.json(row);
});

export default router;
