import { Router } from "express";
import { requireRole } from "../middleware/requireRole";
import { buildCaseTraceGraph } from "../services/graphs/caseTraceGraphBuilder";
import { firestoreCaseStore } from "../services/firestoreCaseStore";

export const decisionGraphsRouter = Router();

decisionGraphsRouter.get("/trace/:caseId", requireRole(["admin", "physician"]), async (req, res) => {
  try {
    const c = await firestoreCaseStore.getCase(req.params.caseId);
    if (!c) { res.status(404).json({ error: "Case not found" }); return; }
    const graph = buildCaseTraceGraph(req.params.caseId, c);
    res.json(graph);
  } catch (err: any) { res.status(500).json({ error: err?.message ?? "Failed" }); }
});
