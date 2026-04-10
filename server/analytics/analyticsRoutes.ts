import { Router } from "express";
import { buildRiskHeatmap, sortByPriority, detectPatterns, getTopRiskComplaint } from "./riskHeatmap";

const router = Router();

router.post("/heatmap", (req, res) => {
  try {
    const patients = Array.isArray(req.body?.patients) ? req.body.patients : [];
    const heatmap  = buildRiskHeatmap(patients);
    const top      = getTopRiskComplaint(heatmap);
    res.json({ ok: true, heatmap, topRisk: top, entryCount: Object.keys(heatmap).length });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/priority", (req, res) => {
  try {
    const patients = Array.isArray(req.body?.patients) ? req.body.patients : [];
    const sorted   = sortByPriority(patients);
    res.json({ ok: true, patients: sorted, count: sorted.length });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/patterns", (req, res) => {
  try {
    const data      = Array.isArray(req.body?.data) ? req.body.data : [];
    const minCount  = parseInt(req.body?.minCount ?? "50");
    const patterns  = detectPatterns(data, minCount);
    res.json({ ok: true, patterns, count: patterns.length });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
