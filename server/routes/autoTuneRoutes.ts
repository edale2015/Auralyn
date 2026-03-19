import { Router, Request, Response } from "express";
import { requireRole } from "../middleware/requireRole";
import {
  logAutoTuneOutcome,
  analyzeFailures,
  suggestRuleChanges,
  getOutcomeStoreSize,
  clearOutcomeStore,
} from "../engines/autoTuneEngine";

const router = Router();

router.post("/log", requireRole(["admin", "physician"]), (req: Request, res: Response) => {
  const { packId, predictedDisposition, actualDisposition, answers, correct } = req.body;
  if (!packId || !predictedDisposition || !actualDisposition) {
    return res.status(400).json({ error: "packId, predictedDisposition, actualDisposition required" });
  }
  const entry = logAutoTuneOutcome({
    packId,
    predictedDisposition,
    actualDisposition,
    answers: answers || {},
    correct: correct ?? (predictedDisposition === actualDisposition),
  });
  res.json({ ok: true, entry });
});

router.get("/analyze", requireRole(["admin", "physician"]), (_req: Request, res: Response) => {
  const patterns = analyzeFailures();
  const suggestions = suggestRuleChanges(patterns);
  res.json({ patterns, suggestions, totalOutcomes: getOutcomeStoreSize() });
});

router.get("/suggestions", requireRole(["admin", "physician"]), (_req: Request, res: Response) => {
  const patterns = analyzeFailures();
  const suggestions = suggestRuleChanges(patterns);
  res.json(suggestions);
});

router.post("/clear", requireRole(["admin"]), (_req: Request, res: Response) => {
  clearOutcomeStore();
  res.json({ ok: true, message: "Auto-tune outcome store cleared" });
});

export default router;
