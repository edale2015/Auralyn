import { Router, Request, Response } from "express";

import { fastTriageFlow } from "./patient/fastTriage";
import { liveClinic, scheduleFollowup } from "./pilot/liveClinic";
import { payerContract, PAYER_CONTRACTS, CPT_BASE } from "./revenue/contracts";
import { registerStep, listSteps, getStep } from "./workflows/registry";
import { runStepWorkflow } from "./workflows/runner";
import { pickRegionByIP, desiredWorkers } from "./infra/gateway";
import { autonomyLevel, executeAutonomy } from "./autonomy/autonomyController";
import { evaluateAlerts, sendSlackAlert, sendWhatsAppAlert } from "./monitoring/alerts";
import { registerConnector, listConnectors, callConnector, checkIntegrations } from "./integrations/connectorHub";
import {
  requireModifiers, quickView, autoRepairTemplate,
  adaptiveQuestions, approveDisposition, autoEscalate,
  trackInteraction, integrationStatus,
} from "./clinical/triageUtils";

const router = Router();

// Register built-in workflow steps on startup
registerStep("fastTriage",   async (i) => { const r = await fastTriageFlow(i); return { ...i, ...r }; });
registerStep("fullTriage",   (i) => ({ ...i, disposition: "ROUTINE", path: "full" }));
registerStep("bill",         (i) => ({ ...i, billed: true }));
registerStep("sendHospital", (i) => ({ ...i, hospitalSent: true }));

// ── Fast Triage ─────────────────────────────────────────────────────────────
router.post("/patient/fast-triage", async (req: Request, res: Response) => {
  try {
    res.json(await fastTriageFlow(req.body ?? {}));
  } catch (e: any) {
    res.status(500).json({ error: e?.message });
  }
});

// ── Live Clinic ──────────────────────────────────────────────────────────────
router.post("/pilot/live-clinic", async (req: Request, res: Response) => {
  try {
    res.json(await liveClinic(req.body ?? {}));
  } catch (e: any) {
    res.status(500).json({ error: e?.message });
  }
});

router.post("/patient/followup", (req: Request, res: Response) => {
  const { patientId, delayMinutes } = req.body ?? {};
  if (!patientId) return res.status(400).json({ error: "patientId required" });
  scheduleFollowup(String(patientId), Number(delayMinutes ?? 60));
  res.json({ ok: true, patientId });
});

// ── Payer Contracts ──────────────────────────────────────────────────────────
router.post("/revenue/contract", (req: Request, res: Response) => {
  const { insurance, cpt } = req.body ?? {};
  if (!insurance || !cpt) return res.status(400).json({ error: "insurance and cpt required" });
  res.json({ reimbursement: payerContract(req.body), insurance, cpt });
});

router.get("/revenue/contracts/payers", (_req: Request, res: Response) => {
  res.json(Object.entries(PAYER_CONTRACTS).map(([k, v]) => ({ payer: k, multiplier: v.multiplier })));
});

router.get("/revenue/contracts/cpt-rates", (_req: Request, res: Response) => {
  res.json(Object.entries(CPT_BASE).map(([cpt, base]) => ({ cpt, base })));
});

// ── Workflow Registry + Runner ───────────────────────────────────────────────
router.post("/workflows/register", (req: Request, res: Response) => {
  const { name } = req.body ?? {};
  if (!name) return res.status(400).json({ error: "name required" });
  res.json({ ok: true, steps: listSteps() });
});

router.get("/workflows/steps", (_req: Request, res: Response) => {
  res.json({ steps: listSteps() });
});

router.post("/workflows/run", async (req: Request, res: Response) => {
  const { steps, input } = req.body ?? {};
  if (!Array.isArray(steps)) return res.status(400).json({ error: "steps[] required" });
  try {
    const result = await runStepWorkflow({ steps }, input ?? {});
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e?.message });
  }
});

router.post("/workflows/save", (req: Request, res: Response) => {
  const { nodes, edges } = req.body ?? {};
  res.json({ ok: true, nodes: nodes?.length ?? 0, edges: edges?.length ?? 0, savedAt: new Date().toISOString() });
});

// ── Multi-Region Gateway ─────────────────────────────────────────────────────
router.get("/infra/region-pick", (req: Request, res: Response) => {
  const ip = String(req.query.ip ?? req.ip ?? "");
  const region = pickRegionByIP(ip);
  res.json({ region: region.name, hasUrl: !!region.url });
});

router.post("/infra/desired-workers", (req: Request, res: Response) => {
  const { queueDepth } = req.body ?? {};
  res.json({ queueDepth, desiredWorkers: desiredWorkers(Number(queueDepth ?? 0)) });
});

// ── Autonomy Controller ──────────────────────────────────────────────────────
router.post("/autonomy/level", (req: Request, res: Response) => {
  const state = req.body ?? {};
  res.json({ level: autonomyLevel(state) });
});

router.post("/autonomy/execute", async (req: Request, res: Response) => {
  const { actions, level } = req.body ?? {};
  if (!Array.isArray(actions)) return res.status(400).json({ error: "actions[] required" });
  if (!level) return res.status(400).json({ error: "level required" });
  const executed = await executeAutonomy(actions, level);
  res.json({ executed });
});

// ── Prometheus Alerts ────────────────────────────────────────────────────────
router.post("/monitoring/alerts/evaluate", async (req: Request, res: Response) => {
  try {
    const result = await evaluateAlerts(req.body ?? {});
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e?.message });
  }
});

router.post("/monitoring/alerts/slack", async (req: Request, res: Response) => {
  const { msg } = req.body ?? {};
  if (!msg) return res.status(400).json({ error: "msg required" });
  await sendSlackAlert(String(msg));
  res.json({ ok: true });
});

router.post("/monitoring/alerts/whatsapp", async (req: Request, res: Response) => {
  const { msg } = req.body ?? {};
  if (!msg) return res.status(400).json({ error: "msg required" });
  await sendWhatsAppAlert(String(msg));
  res.json({ ok: true });
});

// ── Connector Hub ────────────────────────────────────────────────────────────
router.get("/integrations/connectors", (_req: Request, res: Response) => {
  res.json({ connectors: listConnectors() });
});

router.post("/integrations/connectors/register", (req: Request, res: Response) => {
  const { name } = req.body ?? {};
  if (!name) return res.status(400).json({ error: "name required" });
  registerConnector(name, async (p) => ({ echoed: p, ts: new Date().toISOString() }));
  res.json({ ok: true, connectors: listConnectors() });
});

router.post("/integrations/connectors/call", async (req: Request, res: Response) => {
  const { name, payload } = req.body ?? {};
  if (!name) return res.status(400).json({ error: "name required" });
  try {
    const result = await callConnector(String(name), payload ?? {});
    res.json({ result });
  } catch (e: any) {
    res.status(500).json({ error: e?.message });
  }
});

router.get("/integrations/health", async (_req: Request, res: Response) => {
  res.json(await checkIntegrations());
});

// ── Triage Utils ─────────────────────────────────────────────────────────────
router.post("/clinical/require-modifiers", (req: Request, res: Response) => {
  res.json(requireModifiers(req.body ?? {}));
});

router.post("/clinical/quick-view", (req: Request, res: Response) => {
  res.json({ view: quickView(req.body ?? {}) });
});

router.post("/clinical/adaptive-questions", (req: Request, res: Response) => {
  res.json({ questions: adaptiveQuestions(req.body ?? {}) });
});

router.post("/clinical/auto-escalate", (req: Request, res: Response) => {
  res.json({ escalation: autoEscalate(req.body ?? {}) });
});

router.post("/clinical/auto-repair", (req: Request, res: Response) => {
  const { tpl, err } = req.body ?? {};
  res.json({ tpl: autoRepairTemplate(tpl ?? {}, String(err ?? "")) });
});

router.post("/clinical/approve-disposition", (req: Request, res: Response) => {
  const { caseId } = req.body ?? {};
  if (!caseId) return res.status(400).json({ error: "caseId required" });
  approveDisposition(String(caseId));
  res.json({ ok: true, caseId });
});

router.post("/clinical/track-interaction", (req: Request, res: Response) => {
  const { start } = req.body ?? {};
  res.json({ latencyMs: trackInteraction(Number(start ?? Date.now())) });
});

router.get("/integrations/status", async (_req: Request, res: Response) => {
  res.json(await integrationStatus());
});

export default router;
