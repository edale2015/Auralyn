import express from "express";
import {
  getPendingPhysicianReviews,
  approvePhysicianDecision,
  runTelemedVisit,
} from "../telemed/orchestrator";

const router = express.Router();

/**
 * GET /api/physician/review
 * Returns all cases pending physician approval.
 */
router.get("/physician/review", async (_req, res) => {
  try {
    const cases = await getPendingPhysicianReviews();
    res.json({ ok: true, count: cases.length, cases });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch reviews", detail: err?.message });
  }
});

/**
 * POST /api/physician/approve
 * Physician finalizes a pending session with their disposition decision.
 */
router.post("/physician/approve", async (req, res) => {
  try {
    const { caseId, decision } = req.body;

    if (!caseId || !decision) {
      res.status(400).json({ error: "caseId and decision are required" });
      return;
    }

    const result = await approvePhysicianDecision(caseId, decision);
    res.json({ ok: true, result });
  } catch (err: any) {
    res.status(500).json({ error: "Approval failed", detail: err?.message });
  }
});

/**
 * POST /api/physician/telemed-visit
 * Run a full telemedicine visit through the master agent loop.
 */
router.post("/physician/telemed-visit", async (req, res) => {
  try {
    const { patientId, complaint, features, riskScore, probability, centorScore } = req.body;

    if (!patientId || !complaint) {
      res.status(400).json({ error: "patientId and complaint are required" });
      return;
    }

    const result = await runTelemedVisit({
      patientId,
      complaint,
      features:    features    ?? {},
      riskScore:   riskScore   ?? 0.3,
      probability: probability ?? 0.3,
      centorScore: centorScore ?? 0,
    });

    res.json({ ok: true, ...result });
  } catch (err: any) {
    res.status(500).json({ error: "Telemed visit failed", detail: err?.message });
  }
});

export default router;
