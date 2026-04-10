import { Router } from "express";
import { generateExecBrief, buildFdaPack, buildPitchDeck, exportFdaPack, type SystemMetrics } from "./execBrief";

const router = Router();

function buildMetricsFromBody(body: Partial<SystemMetrics>): SystemMetrics {
  return {
    patients:           body.patients           ?? 0,
    erRate:             body.erRate             ?? 0,
    safetyMismatchRate: body.safetyMismatchRate ?? 0,
    p50Latency:         body.p50Latency         ?? 0,
    p95Latency:         body.p95Latency         ?? 0,
    accuracy:           body.accuracy           ?? 0,
    automationFailRate: body.automationFailRate ?? 0,
    goldenCasesTotal:   body.goldenCasesTotal   ?? 0,
    uptime:             body.uptime             ?? 1,
  };
}

router.post("/exec-brief", (req, res) => {
  try {
    const metrics = buildMetricsFromBody(req.body ?? {});
    const brief   = generateExecBrief(metrics);
    res.json({ ok: true, brief });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/fda-pack", (req, res) => {
  try {
    const metrics = buildMetricsFromBody(req.body?.metrics ?? req.body ?? {});
    const tests   = Array.isArray(req.body?.goldenCaseTests) ? req.body.goldenCaseTests : [];
    const pack    = buildFdaPack(metrics, tests);
    res.json({ ok: true, pack });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/fda-pack/export", (req, res) => {
  try {
    const metrics = buildMetricsFromBody(req.body?.metrics ?? req.body ?? {});
    const tests   = Array.isArray(req.body?.goldenCaseTests) ? req.body.goldenCaseTests : [];
    const pack    = buildFdaPack(metrics, tests);
    const outPath = exportFdaPack(pack);
    res.json({ ok: true, pack, exportedTo: outPath });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/pitch-deck", (req, res) => {
  try {
    const metrics = buildMetricsFromBody(req.body ?? {});
    const deck    = buildPitchDeck(metrics);
    res.json({ ok: true, deck });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
