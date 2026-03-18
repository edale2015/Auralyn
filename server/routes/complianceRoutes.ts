import { Router, Request, Response } from "express";
import { requireRole } from "../middleware/requireRole";
import { getModelVersion, logModelUsage, getModelUsageLog } from "../compliance/modelRegistry";
import { classifyRisk, validateSafeDischarge } from "../compliance/riskEngine";
import { exportCaseAudit } from "../compliance/auditExport";

const router = Router();

router.get("/model-version", requireRole(["admin", "physician"]), (_req: Request, res: Response) => {
  res.json({ version: getModelVersion() });
});

router.post("/log-model-usage", requireRole(["admin", "physician"]), (req: Request, res: Response) => {
  const { caseId, engineVersions } = req.body;
  if (!caseId) return res.status(400).json({ error: "caseId required" });
  const entry = logModelUsage(caseId, engineVersions);
  res.json(entry);
});

router.get("/model-usage-log", requireRole(["admin"]), (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 100;
  res.json(getModelUsageLog(limit));
});

router.post("/classify-risk", requireRole(["admin", "physician"]), (req: Request, res: Response) => {
  const classification = classifyRisk(req.body);
  res.json(classification);
});

router.post("/validate-discharge", requireRole(["admin", "physician"]), (req: Request, res: Response) => {
  const validation = validateSafeDischarge(req.body);
  if (!validation.safe) {
    return res.status(422).json(validation);
  }
  res.json(validation);
});

router.post("/export-audit", requireRole(["admin"]), (req: Request, res: Response) => {
  if (!req.body.complaint) {
    return res.status(400).json({ error: "complaint required in trace" });
  }
  const bundle = exportCaseAudit(req.body);
  res.json(bundle);
});

export default router;
