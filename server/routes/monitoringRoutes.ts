import { Router } from "express";
import { detectDrift, resetBaseline, getBaseline } from "../services/monitoring/driftDetectionEngine";
import { evaluateRisk } from "../services/monitoring/riskGovernanceEngine";

const router = Router();

router.post("/drift", (req, res) => {
  try {
    const { antibioticRate, returnVisitRate } = req.body;
    if (antibioticRate === undefined || returnVisitRate === undefined) {
      return res.status(400).json({ error: "antibioticRate and returnVisitRate required" });
    }
    const alerts = detectDrift({ antibioticRate: Number(antibioticRate), returnVisitRate: Number(returnVisitRate) });
    res.json({ alerts, baseline: getBaseline() });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

router.post("/risk", (req, res) => {
  try {
    const { decision, probability, centorScore } = req.body;
    if (!decision || probability === undefined) {
      return res.status(400).json({ error: "decision and probability required" });
    }
    const alerts = evaluateRisk({ decision, probability: Number(probability), centorScore });
    res.json({ alerts });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

router.post("/reset-baseline", (req, res) => {
  try {
    const { antibioticRate, returnVisitRate } = req.body;
    if (antibioticRate === undefined || returnVisitRate === undefined) {
      return res.status(400).json({ error: "antibioticRate and returnVisitRate required" });
    }
    resetBaseline({ antibioticRate: Number(antibioticRate), returnVisitRate: Number(returnVisitRate) });
    res.json({ ok: true, baseline: getBaseline() });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

router.get("/baseline", (_req, res) => {
  res.json(getBaseline());
});

export default router;
