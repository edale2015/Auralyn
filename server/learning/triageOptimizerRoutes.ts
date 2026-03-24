import { Router } from "express";
import {
  recordTriageOutcome,
  optimizeThresholds,
  classifyRisk,
  getThresholds,
  getOptimizerStats,
} from "./triageOptimizer";

const router = Router();

router.post("/record", (req, res) => {
  const { predictedRisk, actualSeverity, complaint, caseId } = req.body;
  if (predictedRisk === undefined || actualSeverity === undefined) {
    return res.status(400).json({ ok: false, error: "predictedRisk and actualSeverity required" });
  }
  recordTriageOutcome({ predictedRisk: Number(predictedRisk), actualSeverity: Number(actualSeverity), complaint, caseId });
  res.json({ ok: true, classification: classifyRisk(Number(predictedRisk)) });
});

router.get("/thresholds", (_req, res) => {
  res.json({ ok: true, thresholds: getThresholds() });
});

router.post("/optimize", (_req, res) => {
  const updated = optimizeThresholds();
  res.json({ ok: true, thresholds: updated });
});

router.post("/classify", (req, res) => {
  const { riskScore } = req.body;
  if (riskScore === undefined) return res.status(400).json({ ok: false, error: "riskScore required" });
  res.json({ ok: true, riskScore: Number(riskScore), classification: classifyRisk(Number(riskScore)), thresholds: getThresholds() });
});

router.get("/stats", (_req, res) => {
  res.json({ ok: true, ...getOptimizerStats() });
});

export default router;
