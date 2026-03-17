import { Router, Request, Response } from "express";
import { requireRole } from "../middleware/requireRole";
import { clinicalDriftDetector } from "../engines/clinicalDriftDetector";
import { diagnosticUncertaintyNavigator } from "../engines/diagnosticUncertaintyNavigator";
import { outcomeLearningEngine } from "../engines/outcomeLearningEngine";
import { clinicalRiskScoringEngine } from "../engines/riskScoringEngine";
import { federatedLearningEngine } from "../federated/federatedLearningEngine";

const router = Router();

router.get("/api/clinical-drift", requireRole(["admin", "physician"]), (_req: Request, res: Response) => {
  const report = clinicalDriftDetector.detect();
  res.json(report);
});

router.get("/api/uncertainty-navigator", requireRole(["admin", "physician"]), (_req: Request, res: Response) => {
  const result = diagnosticUncertaintyNavigator.chooseNextQuestion();
  res.json(result);
});

router.get("/api/outcome-learning", requireRole(["admin", "physician"]), (_req: Request, res: Response) => {
  const report = outcomeLearningEngine.learn();
  res.json(report);
});

router.get("/api/risk-scores/demo", requireRole(["admin", "physician"]), (_req: Request, res: Response) => {
  const scores = clinicalRiskScoringEngine.runDemoScores();
  res.json({ scores });
});

router.post("/api/risk-scores/centor", requireRole(["admin", "physician"]), (req: Request, res: Response) => {
  const result = clinicalRiskScoringEngine.centor(req.body);
  res.json(result);
});

router.post("/api/risk-scores/wells", requireRole(["admin", "physician"]), (req: Request, res: Response) => {
  const result = clinicalRiskScoringEngine.wells(req.body);
  res.json(result);
});

router.post("/api/risk-scores/heart", requireRole(["admin", "physician"]), (req: Request, res: Response) => {
  const result = clinicalRiskScoringEngine.heart(req.body);
  res.json(result);
});

router.get("/api/federated-learning", requireRole(["admin", "physician"]), (_req: Request, res: Response) => {
  const report = federatedLearningEngine.aggregate();
  res.json(report);
});

export default router;
