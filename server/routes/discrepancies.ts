import { Router } from "express";
import { discrepancyService } from "../services/discrepancyService";
import { requireRole } from "../middleware/requireRole";

export const discrepanciesRouter = Router();

discrepanciesRouter.get("/", requireRole(["admin", "physician", "staff"]), async (req, res) => {
  try {
    const limit = Number(req.query.limit ?? 100);
    const items = await discrepancyService.listRecentDiscrepancies(limit);

    res.json({
      count: items.length,
      items
    });
  } catch (err: any) {
    console.error("[Discrepancies] list error:", err);
    res.status(500).json({ error: err?.message ?? "Failed to load discrepancies" });
  }
});

discrepanciesRouter.get("/:caseId", requireRole(["admin", "physician", "staff"]), async (req, res) => {
  try {
    const item = await discrepancyService.getCaseDiscrepancy(req.params.caseId);
    if (!item) {
      return res.status(404).json({ error: "Case discrepancy not found" });
    }
    res.json(item);
  } catch (err: any) {
    console.error("[Discrepancies] get error:", err);
    res.status(500).json({ error: err?.message ?? "Failed to load discrepancy" });
  }
});

discrepanciesRouter.get("/:caseId/timeline", requireRole(["admin", "physician", "staff"]), async (req, res) => {
  try {
    const payload = await discrepancyService.getTimeline(req.params.caseId);
    if (!payload.caseRecord) {
      return res.status(404).json({ error: "Case not found" });
    }
    res.json(payload);
  } catch (err: any) {
    console.error("[Discrepancies] timeline error:", err);
    res.status(500).json({ error: err?.message ?? "Failed to load timeline" });
  }
});
