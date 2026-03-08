import { Router } from "express";
import { requireRole } from "../middleware/requireRole";
import { generateAuditReport } from "../services/auditReportService";
import { queryAccessLog } from "../services/accessLogService";

export const auditReportsRouter = Router();

auditReportsRouter.get("/report", requireRole(["admin"]), async (_req, res) => {
  try {
    res.json(generateAuditReport());
  } catch (err: any) { res.status(500).json({ error: err?.message ?? "Failed" }); }
});

auditReportsRouter.get("/log", requireRole(["admin"]), async (req, res) => {
  try {
    const filters = {
      userId: req.query.userId as string | undefined,
      action: req.query.action as string | undefined,
      resource: req.query.resource as string | undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 100,
    };
    res.json({ entries: queryAccessLog(filters) });
  } catch (err: any) { res.status(500).json({ error: err?.message ?? "Failed" }); }
});
