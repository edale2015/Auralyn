import { Router } from "express";
import {
  logPopulationCase,
  getZipHeatmap,
  getComplaintHeatmap,
  getDiagnosisHeatmap,
  getOutbreakAlerts,
  getCohortStats,
  getRecentCases,
} from "../populationHealth/populationEngine";

const router = Router();

router.get("/heatmap/zip", (_req, res) => {
  res.json({ ok: true, heatmap: getZipHeatmap() });
});

router.get("/heatmap/complaint", (_req, res) => {
  res.json({ ok: true, heatmap: getComplaintHeatmap() });
});

router.get("/heatmap/diagnosis", (_req, res) => {
  res.json({ ok: true, heatmap: getDiagnosisHeatmap() });
});

router.get("/outbreaks", (_req, res) => {
  res.json({ ok: true, alerts: getOutbreakAlerts() });
});

router.get("/cohort", (_req, res) => {
  res.json({ ok: true, stats: getCohortStats() });
});

router.get("/cases", (req, res) => {
  const limit = Number(req.query.limit) || 50;
  res.json({ ok: true, cases: getRecentCases(limit) });
});

router.post("/log", (req, res) => {
  try {
    const { caseId, ...rest } = req.body;
    if (!caseId) return res.status(400).json({ ok: false, error: "caseId required" });
    logPopulationCase({ caseId, ...rest });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

export default router;
