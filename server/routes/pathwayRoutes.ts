import { Router } from "express";
import { getAllPathways, getPathwaysForComplaint } from "../pathways/pathwayRegistry";
import { executeCarePathway } from "../pathways/pathwayExecutor";

const router = Router();

router.get("/api/pathways", (_req, res) => {
  const all = getAllPathways();
  const summary = all.map(p => ({
    complaint: p.complaint,
    disposition: p.disposition,
    title: p.title,
    expectedDuration: p.expectedDuration,
    stepCount: p.steps.length,
  }));
  res.json({ pathways: summary, total: all.length });
});

router.get("/api/pathways/:complaint", (req, res) => {
  const pathways = getPathwaysForComplaint(req.params.complaint);
  if (pathways.length === 0) return res.status(404).json({ error: "No pathways for this complaint" });
  res.json({ pathways });
});

router.post("/api/pathways/execute", (req, res) => {
  const { complaint, disposition, caseId } = req.body;
  if (!complaint || !disposition) return res.status(400).json({ error: "complaint and disposition are required" });
  const result = executeCarePathway(complaint, disposition, caseId);
  if (!result) return res.status(404).json({ error: "No pathway found for this combination" });
  res.json(result);
});

export default router;
