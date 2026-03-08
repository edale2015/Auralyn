import { Router } from "express";
import { requireRole } from "../middleware/requireRole";
import { getComplaintQASummary } from "../services/qa/complaintQADashboardService";

export const complaintQADashboardRouter = Router();

complaintQADashboardRouter.get("/", requireRole(["admin", "physician", "staff"]), async (req, res) => {
  try {
    const complaintId = req.query.complaintId as string | undefined;
    const summaries = await getComplaintQASummary(complaintId);
    res.json({ count: summaries.length, summaries });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to load QA dashboard" });
  }
});
