import { Router } from "express";
import { requireRole } from "../middleware/requireRole";
import { generateSyntheticCases } from "../services/testing/syntheticCaseGenerator";
import { runEngineOnCases } from "../services/testing/engineMassRunner";
import { storeTestRun, listTestRuns, getTestRun } from "../services/testing/engineResultStore";
import { generateEdgeCases } from "../services/testing/edgeCaseExplorer";

export const syntheticTestingRouter = Router();

syntheticTestingRouter.get("/runs", requireRole(["admin"]), async (_req, res) => {
  res.json({ runs: listTestRuns() });
});

syntheticTestingRouter.get("/runs/:runId", requireRole(["admin"]), async (req, res) => {
  const run = getTestRun(req.params.runId);
  if (!run) { res.status(404).json({ error: "Run not found" }); return; }
  res.json(run);
});

syntheticTestingRouter.post("/generate", requireRole(["admin"]), async (req, res) => {
  try {
    const { complaintId, count } = req.body;
    if (!complaintId) { res.status(400).json({ error: "complaintId required" }); return; }
    const cases = generateSyntheticCases(complaintId, count || 10);
    const results = await runEngineOnCases(cases);
    const run = storeTestRun(complaintId, results);
    res.json(run);
  } catch (err: any) { res.status(500).json({ error: err?.message ?? "Failed" }); }
});

syntheticTestingRouter.get("/edge-cases/:complaintId", requireRole(["admin"]), async (req, res) => {
  res.json({ edgeCases: generateEdgeCases(req.params.complaintId) });
});
