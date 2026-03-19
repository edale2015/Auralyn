import { Router, Request, Response } from "express";
import { requireRole } from "../middleware/requireRole";
import { getModelMetadata, attachModelMetadata } from "../compliance/modelVersionEngine";
import { logPerformance, getPerformanceStats, getPerformanceLog, clearPerformanceRegistry } from "../compliance/performanceRegistry";
import { enforceRiskControls } from "../compliance/riskControl";
import { buildAuditBundle } from "../compliance/auditBundleBuilder";

const router = Router();

router.get("/model", requireRole(["admin", "physician"]), (_req: Request, res: Response) => {
  res.json(getModelMetadata());
});

router.post("/attach-metadata", requireRole(["admin", "physician"]), (req: Request, res: Response) => {
  const result = attachModelMetadata(req.body);
  res.json(result);
});

router.post("/log-performance", requireRole(["admin", "physician"]), (req: Request, res: Response) => {
  const { caseId, packId, correct, confidence, latencyMs } = req.body;
  if (correct === undefined) {
    return res.status(400).json({ error: "correct (boolean) required" });
  }
  const entry = logPerformance({ caseId, packId, correct, confidence, latencyMs });
  res.json(entry);
});

router.get("/performance-stats", requireRole(["admin", "physician"]), (_req: Request, res: Response) => {
  res.json(getPerformanceStats());
});

router.get("/performance-log", requireRole(["admin"]), (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 100;
  res.json(getPerformanceLog(limit));
});

router.post("/performance-reset", requireRole(["admin"]), (_req: Request, res: Response) => {
  clearPerformanceRegistry();
  res.json({ ok: true, message: "Performance registry cleared" });
});

router.post("/enforce-risk", requireRole(["admin", "physician"]), (req: Request, res: Response) => {
  const result = enforceRiskControls(req.body);
  if (result.blocked) {
    return res.status(422).json(result);
  }
  res.json(result);
});

router.post("/build-audit-bundle", requireRole(["admin"]), (req: Request, res: Response) => {
  const bundle = buildAuditBundle(req.body);
  res.json(bundle);
});

export default router;
