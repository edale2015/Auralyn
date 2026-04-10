import { Router, Request, Response } from "express";
import { getSystemState } from "./systemState";
import { broadcast } from "./controlBus";
import {
  resetSystem, switchActiveModel, repairTemplate,
  triggerGlobalAlert, generateReport,
} from "./systemControls";

const router = Router();

router.get("/state", (_req: Request, res: Response) => {
  res.json(getSystemState());
});

router.post("/simulate", async (_req: Request, res: Response) => {
  try {
    const { runSimulationBatch } = await import("../simulation/simulationRunner");
    const result = await runSimulationBatch({ complaint: "chest pain", count: 100, difficulty: "medium" });
    broadcast("simulation_done", { total: result.results?.length ?? 0, ts: Date.now() });
    res.json({ ok: true, total: result.results?.length ?? 0, summary: result.summary });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? "simulation failed" });
  }
});

router.post("/stress", async (_req: Request, res: Response) => {
  try {
    const n = 1000;
    const { runStressTest } = await import("../simulation/stressTest");
    const result = await runStressTest(n);
    broadcast("stress_done", result);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? "stress test failed" });
  }
});

router.post("/epic", async (req: Request, res: Response) => {
  try {
    const { patientId, token } = req.body ?? {};
    if (!patientId) return res.status(400).json({ error: "patientId required" });
    const { epicFullFlow } = await import("../integrations/epicFullFlow");
    const result = await epicFullFlow(patientId, token ?? "");
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e?.message });
  }
});

router.post("/scale", (req: Request, res: Response) => {
  const { queueDepth = 0, currentInstances = 2 } = req.body ?? {};
  import("../infra/awsAutoscale").then(({ getScaleRecommendation }) => {
    res.json(getScaleRecommendation(Number(queueDepth), Number(currentInstances)));
  });
});

router.get("/export", async (_req: Request, res: Response) => {
  try {
    const { generateEnterprisePackage } = await import("../reporting/enterprisePackage");
    const pkg = generateEnterprisePackage({ patients: 10_000, erRate: 0.2 });
    broadcast("export_done", { exportedAt: new Date().toISOString() });
    res.json({ ok: true, pkg });
  } catch (e: any) {
    res.status(500).json({ error: e?.message });
  }
});

router.post("/reset", (_req: Request, res: Response) => {
  resetSystem();
  res.json({ ok: true, resetAt: new Date().toISOString() });
});

router.post("/model", (req: Request, res: Response) => {
  const { version } = req.body ?? {};
  if (!version) return res.status(400).json({ error: "version required" });
  switchActiveModel(version);
  res.json({ ok: true, activeModel: version });
});

router.post("/template/repair", (req: Request, res: Response) => {
  const { templateId } = req.body ?? {};
  if (!templateId) return res.status(400).json({ error: "templateId required" });
  repairTemplate(templateId);
  res.json({ ok: true, templateId });
});

router.post("/alert", (req: Request, res: Response) => {
  const { message } = req.body ?? {};
  if (!message) return res.status(400).json({ error: "message required" });
  triggerGlobalAlert(message);
  res.json({ ok: true, alertedAt: new Date().toISOString() });
});

router.get("/report", (_req: Request, res: Response) => {
  const state = getSystemState();
  res.json(generateReport(state));
});

export default router;
