import express from "express";
import { trialSimulator } from "../services/trialSimulator";
import { payerROIService } from "../services/payerROIService";

const router = express.Router();

/**
 * GET /api/roi/simulate?n=200
 * Run a clinical trial and calculate payer ROI from the results.
 */
router.get("/simulate", async (req, res) => {
  try {
    const n     = Math.min(Number(req.query.n ?? 100), 500);
    const trial = await trialSimulator.runTrial(n);
    const roi   = payerROIService.calculate(trial.results);
    res.json({ trial: { total: trial.total, edRate: trial.edRate, avgConfidence: trial.avgConfidence, byComplaint: trial.byComplaint }, roi });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "ROI simulation failed" });
  }
});

export default router;
