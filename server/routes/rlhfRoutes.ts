import express from "express";
import { rlhfService } from "../services/rlhfService";

const router = express.Router();

/**
 * GET /api/rlhf/feedback
 * List all physician feedback events.
 */
router.get("/feedback", (_req, res) => {
  res.json(rlhfService.listFeedback());
});

/**
 * POST /api/rlhf/feedback
 * Submit a new physician feedback event.
 */
router.post("/feedback", (req, res) => {
  try {
    const saved = rlhfService.addFeedback(req.body);
    res.json(saved);
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Could not save feedback",
    });
  }
});

/**
 * GET /api/rlhf/proposals
 * List all RLHF improvement proposals.
 */
router.get("/proposals", (_req, res) => {
  res.json(rlhfService.listProposals());
});

/**
 * POST /api/rlhf/proposals/generate
 * Generate improvement proposals from accumulated feedback (requires ≥5 events per group).
 */
router.post("/proposals/generate", (_req, res) => {
  const proposals = rlhfService.generateProposals();
  res.json({ created: proposals.length, proposals });
});

/**
 * POST /api/rlhf/proposals/:id/review
 * Physician approves, rejects, or marks a proposal as applied.
 */
router.post("/proposals/:id/review", (req, res) => {
  try {
    const { status } = req.body;
    if (!["approved", "rejected", "applied"].includes(status)) {
      res.status(400).json({ error: "status must be approved | rejected | applied" });
      return;
    }
    const proposal = rlhfService.reviewProposal(req.params.id, status);
    res.json(proposal);
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Review failed",
    });
  }
});

export default router;
