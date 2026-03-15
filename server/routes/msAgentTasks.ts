import { Router } from "express";
import { requireRole } from "../middleware/requireRole";
import {
  createSession, listSessions,
  createAsyncJob, updateAsyncJob, getAsyncJob, listAsyncJobs,
} from "../services/agents/msAgentOrchestrator";
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

// ── Synchronous endpoints ──────────────────────────────────────────────────

msAgentTasksRouter.post("/reason", requireRole(["admin", "physician"]), async (req, res) => {
  try {
    const { symptoms, history } = req.body;
    const result = await runClinicalReasoning(symptoms || [], history || []);
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
    const sections = await buildChartSections(c);
    res.json({ sections });
  } catch (err: any) { res.status(500).json({ error: err?.message ?? "Failed" }); }
});

// ── Async GPT-4o Job Queue ─────────────────────────────────────────────────

msAgentTasksRouter.post("/reason/async", requireRole(["admin", "physician"]), async (req, res) => {
  const { symptoms, history } = req.body;
  const input = {
    symptoms: (symptoms || []) as string[],
    history: (history || []) as string[],
  };
  const job = createAsyncJob("reason", input);
  res.json({ jobId: job.jobId, status: job.status });

  // Run GPT-4o in background — fire and forget
  (async () => {
    try {
      updateAsyncJob(job.jobId, { status: "running" });
      const result = await runClinicalReasoning(input.symptoms, input.history);
      updateAsyncJob(job.jobId, {
        status: "complete",
        result,
        completedAt: new Date().toISOString(),
      });
    } catch (err: any) {
      updateAsyncJob(job.jobId, {
        status: "error",
        error: err?.message ?? "GPT-4o reasoning failed",
        completedAt: new Date().toISOString(),
      });
    }
  })();
});

msAgentTasksRouter.post("/chart/:caseId/async", requireRole(["admin", "physician"]), async (req, res) => {
  try {
    const c = await firestoreCaseStore.getCase(req.params.caseId);
    if (!c) { res.status(404).json({ error: "Case not found" }); return; }

    const job = createAsyncJob("chart", { caseId: req.params.caseId });
    res.json({ jobId: job.jobId, status: job.status });

    (async () => {
      try {
        updateAsyncJob(job.jobId, { status: "running" });
        const sections = await buildChartSections(c);
        updateAsyncJob(job.jobId, {
          status: "complete",
          result: { sections },
          completedAt: new Date().toISOString(),
        });
      } catch (err: any) {
        updateAsyncJob(job.jobId, {
          status: "error",
          error: err?.message ?? "Chart build failed",
          completedAt: new Date().toISOString(),
        });
      }
    })();
  } catch (err: any) { res.status(500).json({ error: err?.message ?? "Failed" }); }
});

// ── Job polling ────────────────────────────────────────────────────────────

msAgentTasksRouter.get("/jobs/:jobId", requireRole(["admin", "physician"]), (req, res) => {
  const job = getAsyncJob(req.params.jobId);
  if (!job) { res.status(404).json({ error: "Job not found" }); return; }
  res.json(job);
});

msAgentTasksRouter.get("/jobs", requireRole(["admin", "physician"]), (_req, res) => {
  res.json({ jobs: listAsyncJobs() });
});
