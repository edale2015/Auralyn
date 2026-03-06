import { Router } from "express";
import { runtimeAnalyticsService } from "../services/runtimeAnalyticsService";
import { requireRole } from "../middleware/requireRole";

export const runtimeAnalyticsRouter = Router();

runtimeAnalyticsRouter.get(
  "/dashboard",
  requireRole(["admin", "physician", "staff"]),
  async (req, res) => {
    try {
      const limit = Number(req.query.limit ?? 500);
      const payload = await runtimeAnalyticsService.buildDashboard(limit);
      res.json(payload);
    } catch (err: any) {
      console.error("[RuntimeAnalytics] dashboard error:", err);
      res.status(500).json({
        error: err?.message ?? "Failed to load runtime analytics dashboard"
      });
    }
  }
);

runtimeAnalyticsRouter.get(
  "/complaint/:complaintId",
  requireRole(["admin", "physician", "staff"]),
  async (req, res) => {
    try {
      const limit = Number(req.query.limit ?? 200);
      const payload = await runtimeAnalyticsService.getComplaintDetail(req.params.complaintId, limit);
      res.json(payload);
    } catch (err: any) {
      console.error("[RuntimeAnalytics] complaint detail error:", err);
      res.status(500).json({
        error: err?.message ?? "Failed to load complaint analytics"
      });
    }
  }
);
