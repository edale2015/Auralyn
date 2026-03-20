import express from "express";
import { requireRole } from "../middleware/requireRole";
import { getTraceSteps, getRecentAuditLogs } from "../audit/auditLogger";

const router = express.Router();

router.get("/trace/:id", requireRole(["admin", "physician"]), async (req, res) => {
  const steps = await getTraceSteps(String(req.params.id));
  res.json(steps);
});

router.get("/recent", requireRole(["admin"]), async (req, res) => {
  const limit = Number(req.query.limit) || 50;
  const logs = await getRecentAuditLogs(limit);
  res.json(logs);
});

export default router;
