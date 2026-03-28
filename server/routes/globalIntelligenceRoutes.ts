import { Router } from "express";
import { getGlobalIntelligenceState, getModelHistoryPublic, runGlobalAggregationCycle, applyGlobalBoost } from "../global/globalIntelligenceStore";
import { buildExportPayload } from "../global/exporter";
import { runSyncCycle } from "../global/globalSyncLoop";

const router = Router();

router.get("/status", (_req, res) => {
  res.json({ ok: true, state: getGlobalIntelligenceState() });
});

router.get("/model-history", (_req, res) => {
  res.json({ ok: true, history: getModelHistoryPublic() });
});

router.get("/export", (_req, res) => {
  const payload = buildExportPayload();
  res.json({ ok: true, payload });
});

router.post("/sync", (_req, res) => {
  try {
    runSyncCycle();
    res.json({ ok: true, state: getGlobalIntelligenceState() });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/boost", (req, res) => {
  const { score = 1.0, dx = "" } = req.body;
  const boosted = applyGlobalBoost(Number(score), String(dx));
  res.json({ ok: true, original: score, boosted, dx });
});

export default router;
