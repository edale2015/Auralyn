import express from "express";
import { trialSimulator } from "../services/trialSimulator";

const router = express.Router();

/**
 * GET /api/trial/run?n=100
 * Run a synthetic clinical trial of N patients (max 500).
 */
router.get("/run", async (req, res) => {
  try {
    const n = Math.min(Number(req.query.n ?? 50), 500);
    const result = await trialSimulator.runTrial(n);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Trial failed" });
  }
});

export default router;
