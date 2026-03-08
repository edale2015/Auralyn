import { Router } from "express";
import { requireRole } from "../middleware/requireRole";
import { listFormulary, searchFormulary } from "../services/medicationGovernance/formularyService";
import { getAllRules } from "../services/medicationGovernance/medicationRuleRegistry";
import { runMedicationSafetyCheck } from "../services/medicationGovernance/medicationSafetyService";

export const formularyRouter = Router();

formularyRouter.get("/", requireRole(["admin", "physician", "staff"]), async (req, res) => {
  const query = req.query.q as string | undefined;
  res.json({ entries: query ? searchFormulary(query) : listFormulary() });
});

formularyRouter.get("/rules", requireRole(["admin", "physician"]), async (_req, res) => {
  res.json({ rules: getAllRules() });
});

formularyRouter.post("/safety-check", requireRole(["admin", "physician"]), async (req, res) => {
  try {
    const { medicationId, currentMedications, patientProfile } = req.body;
    if (!medicationId) { res.status(400).json({ error: "medicationId required" }); return; }
    const result = runMedicationSafetyCheck(medicationId, currentMedications || [], patientProfile || {});
    res.json(result);
  } catch (err: any) { res.status(500).json({ error: err?.message ?? "Failed" }); }
});
