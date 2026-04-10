import { Router, Request, Response } from "express";
import { runAutopilot } from "./autopilotAgent";
import { pilotWorkflow, recordPhysicianOverride, getEMSLog, getOverrideLog } from "./pilotWorkflow";
import { setMode, getMode, isCanary, enforceProductionSafety } from "./productionMode";
import { getSystemState } from "../control/systemState";
import { interruptSystem, computeKPIs, syncGlobalState } from "./autopilotUtils";

const router = Router();

router.post("/run", async (_req: Request, res: Response) => {
  try {
    const result = await runAutopilot();
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? "autopilot error" });
  }
});

router.post("/pilot/workflow", async (req: Request, res: Response) => {
  try {
    const { patient, token } = req.body ?? {};
    if (!patient?.patientId) return res.status(400).json({ error: "patient.patientId required" });
    const result = await pilotWorkflow(patient, token ?? "");
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e?.message });
  }
});

router.post("/override", (req: Request, res: Response) => {
  const { patientId, previousDisposition = "UNKNOWN", newDisposition, physicianId, reason } = req.body ?? {};
  if (!patientId || !newDisposition) {
    return res.status(400).json({ error: "patientId and newDisposition required" });
  }
  const record = recordPhysicianOverride({ patientId, previousDisposition, newDisposition, physicianId, reason });
  res.json({ ok: true, record });
});

router.get("/ems/log", (_req: Request, res: Response) => {
  res.json(getEMSLog());
});

router.get("/overrides", (_req: Request, res: Response) => {
  res.json(getOverrideLog());
});

router.post("/mode", (req: Request, res: Response) => {
  const { mode } = req.body ?? {};
  if (!mode) return res.status(400).json({ error: "mode required" });
  setMode(mode);
  res.json({ ok: true, mode: getMode() });
});

router.get("/mode", (_req: Request, res: Response) => {
  res.json({ mode: getMode() });
});

router.get("/canary/:userId", (req: Request, res: Response) => {
  const { userId } = req.params;
  res.json({ userId, isCanary: isCanary(userId), fraction: userId.charCodeAt(0) % 100 });
});

router.get("/safety/check", (_req: Request, res: Response) => {
  try {
    const state = getSystemState();
    const safe = enforceProductionSafety(state);
    res.json({ safe, mismatchRate: state.safety.mismatchRate });
  } catch (e: any) {
    res.status(200).json({ safe: false, reason: e?.message });
  }
});

router.post("/interrupt", (req: Request, res: Response) => {
  const { reason } = req.body ?? {};
  if (!reason) return res.status(400).json({ error: "reason required" });
  interruptSystem(reason);
  res.json({ ok: true, reason, ts: new Date().toISOString() });
});

router.get("/kpis", (_req: Request, res: Response) => {
  const state = getSystemState() as any;
  const kpis = computeKPIs(state);
  res.json(kpis);
});

router.post("/sync", (req: Request, res: Response) => {
  const { regions } = req.body ?? {};
  if (!Array.isArray(regions)) return res.status(400).json({ error: "regions[] required" });
  const synced = syncGlobalState(regions);
  res.json({ synced, count: synced.length });
});

router.post("/fda/export", async (req: Request, res: Response) => {
  try {
    const state = getSystemState();
    const { writeFDAPackage } = await import("../exec/fdaExport");
    const pkg = writeFDAPackage(state as any);
    res.json({ ok: true, pkg });
  } catch (e: any) {
    res.status(500).json({ error: e?.message });
  }
});

router.get("/fda/bundle", async (_req: Request, res: Response) => {
  const state = getSystemState();
  const { exportEnterpriseBundle } = await import("../exec/fdaExport");
  res.json(exportEnterpriseBundle(state as any));
});

export default router;
