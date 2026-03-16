import { Router, Request, Response } from "express";
import { requireRole } from "../middleware/requireRole";
import { getAuditHistory, getAuditStats } from "../audit/clinicalChangeAuditLog";
import { analyzeChangeImpact } from "../audit/changeImpactAnalyzer";

const router = Router();

router.get("/api/clinical-audit-log", requireRole(["admin"]), (req: Request, res: Response) => {
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 200;
  const sheet = req.query.sheet as string | undefined;

  let records = getAuditHistory(limit);

  if (sheet) {
    records = records.filter((r) => r.sheet === sheet);
  }

  const withImpact = records.map((r) => ({
    ...r,
    impact: analyzeChangeImpact(r),
  }));

  res.json({
    count: withImpact.length,
    records: withImpact,
  });
});

router.get("/api/clinical-audit-log/stats", requireRole(["admin"]), (_req: Request, res: Response) => {
  res.json(getAuditStats());
});

export default router;
