import { Router } from "express";
import { requireRole } from "../middleware/requireRole";
import { getOutcomeMonitoringSummary } from "../services/outcomeMonitoring/outcomeMonitoringService";
import { analyzeBouncebacks } from "../services/outcomeMonitoring/bouncebackAnalyzer";

export const outcomeMonitoringRouter = Router();

outcomeMonitoringRouter.get("/summary", requireRole(["admin", "physician"]), async (_req, res) => {
  try { res.json(await getOutcomeMonitoringSummary()); }
  catch (err: any) { res.status(500).json({ error: err?.message ?? "Failed" }); }
});

outcomeMonitoringRouter.get("/bouncebacks", requireRole(["admin", "physician"]), async (req, res) => {
  try {
    const days = parseInt(req.query.days as string) || 7;
    res.json(await analyzeBouncebacks(days));
  } catch (err: any) { res.status(500).json({ error: err?.message ?? "Failed" }); }
});
