import { Router } from "express";
import { requireRole } from "../middleware/requireRole";
import { getControlCenterSummary } from "../services/workbench/complaintControlCenterService";

export const complaintControlCenterRouter = Router();

complaintControlCenterRouter.get("/", requireRole(["admin", "physician"]), async (_req, res) => {
  try {
    const summaries = await getControlCenterSummary();
    res.json({ count: summaries.length, summaries });
  } catch (err: any) { res.status(500).json({ error: err?.message ?? "Failed" }); }
});
