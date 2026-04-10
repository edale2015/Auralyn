import { Router, Request, Response } from "express";

import { predictDenial, routeByPayer, batchPredictDenials } from "./revenue/denialPredictor";
import { followupAgent, careNavigator } from "./patient/chatAgent";
import { buildIPOReport } from "./exec/ipoReport";
import { systemHealth, troubleshoot, maintenanceTasks } from "./ops/systemOps";
import { productionPatientFlow } from "./revenue/productionFlow";
import { getSystemState } from "./control/systemState";

const router = Router();

// ── Denial Prediction ───────────────────────────────────────────────────────
router.post("/revenue/denial/predict", (req: Request, res: Response) => {
  const claim = req.body;
  if (!claim) return res.status(400).json({ error: "claim body required" });
  res.json(predictDenial(claim));
});

router.post("/revenue/denial/batch", (req: Request, res: Response) => {
  const { claims } = req.body ?? {};
  if (!Array.isArray(claims)) return res.status(400).json({ error: "claims[] required" });
  res.json({ results: batchPredictDenials(claims), count: claims.length });
});

router.post("/revenue/payer/route", (req: Request, res: Response) => {
  const patient = req.body;
  if (!patient) return res.status(400).json({ error: "patient body required" });
  res.json({ route: routeByPayer(patient), insurance: patient.insurance });
});

// ── Patient AI Chat ─────────────────────────────────────────────────────────
router.post("/patient/chat", async (req: Request, res: Response) => {
  try {
    const { msg, message } = req.body ?? {};
    const input = msg ?? message;
    if (!input) return res.status(400).json({ error: "msg required" });
    const { patientChat } = await import("./patient/chatAgent");
    const reply = await patientChat(String(input));
    res.json({ reply });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? "Chat error" });
  }
});

router.post("/patient/followup", async (req: Request, res: Response) => {
  const patient = req.body ?? {};
  const action = await followupAgent(patient);
  res.json({ action, patientId: patient.patientId });
});

router.post("/patient/navigate", (req: Request, res: Response) => {
  const patient = req.body ?? {};
  res.json({ destination: careNavigator(patient), risk: patient.risk });
});

// ── Production Patient Flow ─────────────────────────────────────────────────
router.post("/production/patient-flow", async (req: Request, res: Response) => {
  try {
    const patient = req.body;
    if (!patient?.patientId) return res.status(400).json({ error: "patientId required" });
    const result = await productionPatientFlow(patient);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e?.message });
  }
});

// ── IPO Report ──────────────────────────────────────────────────────────────
router.post("/exec/ipo-report", (req: Request, res: Response) => {
  const metrics = req.body ?? {};
  res.json(buildIPOReport(metrics));
});

router.get("/exec/ipo-report", (_req: Request, res: Response) => {
  const state = getSystemState() as any;
  res.json(buildIPOReport({
    patients: state.simulation?.totalSimulated ?? 0,
    revenue: 0,
    regions: state.infrastructure?.regions ?? [],
  }));
});

// ── System Ops ──────────────────────────────────────────────────────────────
router.get("/ops/health", (_req: Request, res: Response) => {
  const state = getSystemState();
  res.json(systemHealth(state as any));
});

router.post("/ops/troubleshoot", (req: Request, res: Response) => {
  const { error } = req.body ?? {};
  if (!error) return res.status(400).json({ error: "error string required" });
  res.json({ action: troubleshoot(String(error)), error });
});

router.get("/ops/maintenance-tasks", (_req: Request, res: Response) => {
  res.json({ tasks: maintenanceTasks() });
});

export default router;
