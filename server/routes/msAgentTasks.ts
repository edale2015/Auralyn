import { Router } from "express";
import { requireRole } from "../middleware/requireRole";
import { createSession, listSessions, addStep, completeSession, getSession } from "../services/agents/msAgentOrchestrator";
import { runClinicalReasoning } from "../services/agents/msClinicalReasoningAgent";
import { reviewCaseForCompleteness } from "../services/agents/msReviewAgent";
import { buildChartSections } from "../services/agents/msChartAgent";
import { firestoreCaseStore } from "../services/firestoreCaseStore";

export const msAgentTasksRouter = Router();

msAgentTasksRouter.get("/sessions", requireRole(["admin", "physician"]), async (_req, res) => {
  res.json({ sessions: listSessions() });
});

msAgentTasksRouter.post("/sessions", requireRole(["admin", "physician"]), async (_req, res) => {
  res.json(createSession());
});

msAgentTasksRouter.post("/reason", requireRole(["admin", "physician"]), async (req, res) => {
  try {
    const { symptoms, history } = req.body;
    const result = runClinicalReasoning(symptoms || [], history || []);
    res.json(result);
  } catch (err: any) { res.status(500).json({ error: err?.message ?? "Failed" }); }
});

msAgentTasksRouter.post("/review/:caseId", requireRole(["admin", "physician"]), async (req, res) => {
  try {
    const c = await firestoreCaseStore.getCase(req.params.caseId);
    if (!c) { res.status(404).json({ error: "Case not found" }); return; }
    res.json({ suggestions: reviewCaseForCompleteness(c) });
  } catch (err: any) { res.status(500).json({ error: err?.message ?? "Failed" }); }
});

msAgentTasksRouter.post("/chart/:caseId", requireRole(["admin", "physician"]), async (req, res) => {
  try {
    const c = await firestoreCaseStore.getCase(req.params.caseId);
    if (!c) { res.status(404).json({ error: "Case not found" }); return; }
    res.json({ sections: buildChartSections(c) });
  } catch (err: any) { res.status(500).json({ error: err?.message ?? "Failed" }); }
});
