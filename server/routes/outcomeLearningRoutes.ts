import { Router, Request, Response } from "express";
import { requireRole } from "../middleware/requireRole";
import { logOutcome, learnFromOutcomes, getOutcomeCount, getRecentOutcomes, clearOutcomes } from "../learning/outcomeLearningEngine";
import { runLearningLoop } from "../learning/continuousLearningAgent";
import { reinforceOutcome } from "../learning/rlhfEngine";
import { getAllWeights, getWeightHistory, resetWeights } from "../learning/weightStore";

const router = Router();

router.post("/log", requireRole(["admin", "physician"]), (req: Request, res: Response) => {
  const { packId, caseId, predictedDiagnosis, actualDiagnosis, correct } = req.body;
  if (!packId || !predictedDiagnosis || !actualDiagnosis) {
    return res.status(400).json({ error: "packId, predictedDiagnosis, actualDiagnosis required" });
  }
  const entry = logOutcome({
    packId,
    caseId,
    predictedDiagnosis,
    actualDiagnosis,
    correct: correct ?? (predictedDiagnosis === actualDiagnosis),
  });
  res.json({ ok: true, entry });
});

router.get("/insights", requireRole(["admin", "physician"]), (_req: Request, res: Response) => {
  res.json(learnFromOutcomes());
});

router.get("/recent", requireRole(["admin", "physician"]), (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 50;
  res.json({ count: getOutcomeCount(), outcomes: getRecentOutcomes(limit) });
});

router.post("/reinforce", requireRole(["admin"]), (req: Request, res: Response) => {
  const { predicted, actual } = req.body;
  if (!predicted || !actual) {
    return res.status(400).json({ error: "predicted and actual objects required" });
  }
  const result = reinforceOutcome(predicted, actual);
  res.json(result);
});

router.post("/run-learning-loop", requireRole(["admin"]), (_req: Request, res: Response) => {
  const result = runLearningLoop();
  res.json(result);
});

router.get("/weights", requireRole(["admin", "physician"]), (_req: Request, res: Response) => {
  res.json({ weights: getAllWeights(), history: getWeightHistory() });
});

router.post("/weights/reset", requireRole(["admin"]), (_req: Request, res: Response) => {
  resetWeights();
  clearOutcomes();
  res.json({ ok: true, message: "Weights and outcome memory cleared" });
});

export default router;
