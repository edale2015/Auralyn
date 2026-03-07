import { Router } from "express";
import { requireRole } from "../middleware/requireRole";
import { computeWorkflowHealth } from "../services/clinicalWorkflowHealthService";

export const clinicalWorkflowHealthRouter = Router();

clinicalWorkflowHealthRouter.get(
  "/",
  requireRole(["admin", "physician", "staff"]),
  async (req, res) => {
    try {
      const health = await computeWorkflowHealth();
      res.json(health);
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? "Failed to compute workflow health" });
    }
  }
);
