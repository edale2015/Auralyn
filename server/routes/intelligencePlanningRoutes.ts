import { Router } from "express";
import { runClinicalPlanningCycle } from "../planning/clinicalIntelligencePlanner";

export const intelligencePlanningRouter = Router();

intelligencePlanningRouter.get("/api/clinical-planner/run", (_req, res) => {
  try {
    const result = runClinicalPlanningCycle();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Planning cycle failed" });
  }
});

intelligencePlanningRouter.get("/api/clinical-planner/priorities", (req, res) => {
  try {
    const result = runClinicalPlanningCycle();
    const level = req.query?.level as string;
    const filtered = level
      ? result.priorities.filter((p) => p.priority === level)
      : result.priorities;
    res.json({ count: filtered.length, priorities: filtered });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to get priorities" });
  }
});
