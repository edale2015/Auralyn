import { Router } from "express";
import { requireRole } from "../middleware/requireRole";
import { validateCase, validateBatch } from "../services/validation/clinicalValidationService";

export const clinicalValidationRouter = Router();

clinicalValidationRouter.get("/:caseId", requireRole(["admin", "physician"]), async (req, res) => {
  try { res.json(await validateCase(req.params.caseId)); }
  catch (err: any) { res.status(500).json({ error: err?.message ?? "Failed" }); }
});

clinicalValidationRouter.get("/", requireRole(["admin"]), async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    res.json(await validateBatch(limit));
  } catch (err: any) { res.status(500).json({ error: err?.message ?? "Failed" }); }
});
