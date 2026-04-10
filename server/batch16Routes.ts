import { Router, Request, Response } from "express";

import { generateWorkflow } from "./workflows/autoBuilder";
import { writeEHRAll } from "./integrations/ehrUnified";
import { processRevenue } from "./revenue/fullRevenue";
import { sloBurn, evaluateSystem, routeOnCall } from "./clinical/observabilityUtils";
import { dynamicQuestionGraph, physicianMacro } from "./clinical/questionGraph";
import { enqueueRetry, getQueue, clearQueue, processRetry } from "./clinical/retryQueue";
import { can, listRoles, listPermissions } from "./tenancy/roles";
import { updateMemory, getMemory, clearMemory, memoryStats } from "./clinical/patientMemory";
import { repairLoop, performanceScore } from "./clinical/repairLoop";
import { addIntegration, listIntegrations, runIntegration, connectorHealth } from "./integrations/integrationHub";
import { runFinalPipeline } from "./clinical/finalPipeline";

const router = Router();

// ── AI Workflow Auto-Generation ───────────────────────────────────────────────
router.post("/workflows/auto", async (req: Request, res: Response) => {
  const { prompt } = req.body ?? {};
  if (!prompt) return res.status(400).json({ error: "prompt required" });
  const graph = await generateWorkflow(String(prompt));
  res.json(graph);
});

// ── Live Pilot (EHR Write After Triage) ──────────────────────────────────────
router.post("/pilot/live", async (req: Request, res: Response) => {
  const patient = req.body ?? {};
  if (!patient.patientId) return res.status(400).json({ error: "patientId required" });
  try {
    const triage = runFinalPipeline(patient);
    const ehr = await writeEHRAll({
      patientId: patient.patientId,
      disposition: triage.safetyDisposition,
      vitals: patient.vitals,
    });
    res.json({ triage, ehr });
  } catch (e: any) {
    res.status(500).json({ error: e?.message });
  }
});

// ── Full Revenue Pipeline ─────────────────────────────────────────────────────
router.post("/revenue/full", (req: Request, res: Response) => {
  const { patient, disposition } = req.body ?? {};
  if (!patient || !disposition) return res.status(400).json({ error: "patient and disposition required" });
  try {
    const result = processRevenue(patient, disposition);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e?.message });
  }
});

// ── SLO Burn Rate + System Eval ───────────────────────────────────────────────
router.post("/slo/burn", (req: Request, res: Response) => {
  const { errors = 0, total = 100 } = req.body ?? {};
  res.json({ status: sloBurn(Number(errors), Number(total)) });
});

router.post("/slo/evaluate", async (req: Request, res: Response) => {
  const { latency = 1000, safety = { mismatchRate: 0 }, ...rest } = req.body ?? {};
  const state = { latency: Number(latency), safety, ...rest };
  const alerts = evaluateSystem(state);
  await routeOnCall(alerts);
  res.json({ alerts, count: alerts.length });
});

// ── Dynamic Question Graph ────────────────────────────────────────────────────
router.get("/questions/graph", (req: Request, res: Response) => {
  const complaint = String(req.query.complaint ?? "");
  res.json({ questions: dynamicQuestionGraph({ complaint }) });
});

// ── Physician Macros ──────────────────────────────────────────────────────────
router.post("/physician/macro", (req: Request, res: Response) => {
  const { action } = req.body ?? {};
  if (!action) return res.status(400).json({ error: "action required" });
  res.json({ actions: physicianMacro(String(action)) });
});

// ── Retry Queue ───────────────────────────────────────────────────────────────
router.get("/retry/queue", (_req: Request, res: Response) => {
  res.json({ queue: getQueue().map(j => ({ id: j.id, priority: j.priority, attempts: j.attempts })) });
});

router.post("/retry/process", async (_req: Request, res: Response) => {
  const result = await processRetry();
  res.json(result);
});

router.delete("/retry/queue", (_req: Request, res: Response) => {
  clearQueue();
  res.json({ ok: true });
});

// ── RBAC ──────────────────────────────────────────────────────────────────────
router.get("/roles", (_req: Request, res: Response) => {
  res.json({ roles: listRoles() });
});

router.get("/roles/:role/permissions", (req: Request, res: Response) => {
  res.json({ permissions: listPermissions(req.params.role) });
});

router.post("/roles/check", (req: Request, res: Response) => {
  const { role, action } = req.body ?? {};
  res.json({ allowed: can(String(role ?? ""), String(action ?? "")) });
});

// ── Patient Memory ────────────────────────────────────────────────────────────
router.post("/patient/memory/:id", (req: Request, res: Response) => {
  const { complaint, disposition, vitals } = req.body ?? {};
  updateMemory(req.params.id, { complaint, disposition, vitals });
  res.json({ ok: true });
});

router.get("/patient/memory/:id", (req: Request, res: Response) => {
  res.json({ history: getMemory(req.params.id) });
});

router.get("/patient/memory-stats", (_req: Request, res: Response) => {
  res.json(memoryStats());
});

// ── Repair Loop + Performance ─────────────────────────────────────────────────
router.post("/system/repair", (req: Request, res: Response) => {
  const { errors } = req.body ?? {};
  if (!Array.isArray(errors)) return res.status(400).json({ error: "errors[] required" });
  res.json(repairLoop(errors));
});

router.post("/system/performance-score", (req: Request, res: Response) => {
  const { errorRate = 0, speedScore = 1, denialRate = 0 } = req.body ?? {};
  const score = performanceScore({ errorRate: Number(errorRate), speedScore: Number(speedScore), denialRate: Number(denialRate) });
  res.json({ score });
});

// ── Integration Hub ───────────────────────────────────────────────────────────
router.get("/integrations", (_req: Request, res: Response) => {
  res.json({ integrations: listIntegrations() });
});

router.post("/connectors/health", async (req: Request, res: Response) => {
  const { connectors } = req.body ?? {};
  if (!Array.isArray(connectors)) return res.status(400).json({ error: "connectors[] required" });
  const status = await connectorHealth(
    connectors.map((c: any) => ({
      name: String(c.name),
      ping: async () => {
        if (c.status === "fail") throw new Error("ping failed");
      },
    }))
  );
  res.json({ status });
});

export default router;
