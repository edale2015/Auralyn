import { Router } from "express";
import { listVersions, switchModel, rollbackModel } from "./modelRegistry";
import { getFeatureLog, exportFeatureLogNdjson, clearFeatureLog, getFeatureLogStats } from "./featureLogger";
import { generateSynthetic } from "./syntheticData";
import { getMLServiceStatus } from "./externalMLClient";
import { getRetrainStats, retrainIfNeeded } from "./retrainScheduler";

const router = Router();

router.get("/registry", (_req, res) => {
  res.json({ ok: true, ...listVersions() });
});

router.post("/registry/switch", (req, res) => {
  const { version, notes } = req.body ?? {};
  if (!version) return res.status(400).json({ ok: false, error: "version required" });
  const entry = switchModel(version, notes);
  res.json({ ok: true, switched: entry });
});

router.post("/registry/rollback", (_req, res) => {
  const prev = rollbackModel();
  if (!prev) return res.status(409).json({ ok: false, error: "No previous version to roll back to" });
  res.json({ ok: true, rolledBack: prev });
});

router.get("/features/log", (req, res) => {
  const limit = parseInt(req.query.limit as string) || 100;
  res.json({ ok: true, entries: getFeatureLog(limit), stats: getFeatureLogStats() });
});

router.get("/features/export", (_req, res) => {
  const ndjson = exportFeatureLogNdjson();
  res.set("Content-Type", "application/x-ndjson");
  res.set("Content-Disposition", `attachment; filename="features_${Date.now()}.ndjson"`);
  res.end(ndjson);
});

router.delete("/features/log", (_req, res) => {
  clearFeatureLog();
  res.json({ ok: true, message: "Feature log cleared" });
});

router.post("/synthetic", (req, res) => {
  const n    = Math.min(parseInt(req.body?.n ?? "100"), 10000);
  const seed = req.body?.seed != null ? parseInt(req.body.seed) : undefined;
  const data = generateSynthetic(n, seed);
  res.json({ ok: true, count: data.length, samples: data.slice(0, 3), total: data.length });
});

router.get("/external/status", (_req, res) => {
  res.json({ ok: true, ...getMLServiceStatus() });
});

router.get("/retrain/stats", (_req, res) => {
  res.json({ ok: true, ...getRetrainStats() });
});

router.post("/retrain/check", async (req, res) => {
  try {
    const { accuracy = 0.95 } = req.body ?? {};
    const result = await retrainIfNeeded({ accuracy });
    res.json({ ok: true, result });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
