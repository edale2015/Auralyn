import { Router } from "express";
import { requireRole } from "../middleware/requireRole";
import { checkExportReadiness } from "../services/caseExportReadinessChecker";

export const exportReadinessRouter = Router();

exportReadinessRouter.get(
  "/:caseId",
  requireRole(["admin", "physician", "staff"]),
  async (req, res) => {
    try {
      const result = await checkExportReadiness(req.params.caseId);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? "Failed to check export readiness" });
    }
  }
);
