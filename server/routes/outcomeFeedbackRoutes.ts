import express from "express";
import { requireRole } from "../middleware/requireRole";
import { recordOutcome, runLearningCycle, getRecentOutcomes, getAllWeights } from "../engines/unifiedOutcomeLearning";

const router = express.Router();

router.post("/feedback", requireRole(["admin", "physician", "staff"]), async (req, res) => {
  const { predicted, actual, input } = req.body;
  if (!predicted || !actual) {
    return res.status(400).json({ error: "predicted and actual diagnosis required" });
  }
  await recordOutcome({ predicted, actual, input: input ?? {} });
  res.json({ success: true });
});

router.post("/learning/run", requireRole(["admin"]), async (_req, res) => {
  const result = await runLearningCycle();
  res.json(result);
});

router.get("/outcomes", requireRole(["admin", "physician"]), async (req, res) => {
  const limit = Number(req.query.limit) || 50;
  const rows = await getRecentOutcomes(limit);
  res.json(rows);
});

router.get("/weights", requireRole(["admin"]), async (_req, res) => {
  const rows = await getAllWeights();
  res.json(rows);
});

export default router;
