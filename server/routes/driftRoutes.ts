import express from "express";
import { driftDetectionService } from "../services/driftDetectionService";

const router = express.Router();

/**
 * GET /api/drift
 * Detect behaviour drift across all complaints (requires ≥10 total samples).
 */
router.get("/", (_req, res) => {
  res.json(driftDetectionService.detect());
});

/**
 * GET /api/drift/:complaint
 * Detect drift for a specific complaint category.
 */
router.get("/:complaint", (req, res) => {
  res.json(driftDetectionService.detect(req.params.complaint));
});

/**
 * POST /api/drift/record
 * Manually record a drift metric (complaint, avgConfidence, avgRisk).
 */
router.post("/record", (req, res) => {
  try {
    const { complaint, avgConfidence, avgRisk } = req.body;
    if (!complaint || avgConfidence === undefined) {
      res.status(400).json({ error: "complaint and avgConfidence are required" });
      return;
    }
    driftDetectionService.record({
      complaint,
      avgConfidence: Number(avgConfidence),
      avgRisk:       Number(avgRisk ?? 0),
    });
    res.json({ ok: true, historyLength: driftDetectionService.history_length() });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Record failed" });
  }
});

export default router;
