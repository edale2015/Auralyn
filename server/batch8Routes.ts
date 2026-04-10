import { Router, Request, Response } from "express";

import { runLivePilot, ingestHospitalOutcome } from "./pilot/livePilot";
import { startProductionLoop, stopProductionLoop, getLoopStatus, watchdog } from "./runtime/productionLoop";
import { assignCPT, estimateRevenue, computePLV, clinicScore } from "./billing/cptRevenue";
import { findExpansionTargets, deployRegion, runNationalExpansion, getDeploymentLog } from "./national/rolloutEngine";
import { shedLoad, recoverSystem, broadcastNational } from "./clinical/clinicIntelligence";
import { getSystemState } from "./control/systemState";

const router = Router();

// ── Live Pilot ──────────────────────────────────────────────────────────────
router.post("/pilot/live", async (req: Request, res: Response) => {
  try {
    const patient = req.body;
    if (!patient?.patientId) return res.status(400).json({ error: "patientId required" });
    const result = await runLivePilot(patient);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e?.message });
  }
});

router.post("/pilot/outcome", async (req: Request, res: Response) => {
  try {
    const outcome = req.body;
    if (!outcome?.patientId) return res.status(400).json({ error: "patientId required" });
    const ok = await ingestHospitalOutcome(outcome);
    res.json({ ok });
  } catch (e: any) {
    res.status(500).json({ error: e?.message });
  }
});

// ── Production Loop ─────────────────────────────────────────────────────────
router.post("/production/loop/start", (_req: Request, res: Response) => {
  startProductionLoop(5_000);
  res.json({ ok: true, status: getLoopStatus() });
});

router.post("/production/loop/stop", (_req: Request, res: Response) => {
  stopProductionLoop();
  res.json({ ok: true, status: getLoopStatus() });
});

router.get("/production/loop/status", (_req: Request, res: Response) => {
  res.json(getLoopStatus());
});

router.get("/production/watchdog", (_req: Request, res: Response) => {
  const state = getSystemState();
  watchdog(state);
  res.json({ mismatchRate: state.safety.mismatchRate, ok: true });
});

// ── CPT + Revenue ───────────────────────────────────────────────────────────
router.post("/billing/cpt", (req: Request, res: Response) => {
  const { disposition } = req.body ?? {};
  if (!disposition) return res.status(400).json({ error: "disposition required" });
  const code = assignCPT(disposition);
  res.json({ disposition, cptCode: code });
});

router.post("/billing/revenue", (req: Request, res: Response) => {
  const { visits } = req.body ?? {};
  if (!Array.isArray(visits)) return res.status(400).json({ error: "visits[] required" });
  res.json({ total: estimateRevenue(visits), count: visits.length });
});

router.post("/billing/plv", (req: Request, res: Response) => {
  const { history } = req.body ?? {};
  if (!Array.isArray(history)) return res.status(400).json({ error: "history[] required" });
  res.json({ plv: computePLV(history) });
});

router.post("/billing/clinic-score", (req: Request, res: Response) => {
  const { visits } = req.body ?? {};
  if (!Array.isArray(visits)) return res.status(400).json({ error: "visits[] required" });
  res.json(clinicScore(visits));
});

// ── National Rollout ────────────────────────────────────────────────────────
router.post("/national/expansion/targets", (req: Request, res: Response) => {
  const { regions } = req.body ?? {};
  if (!Array.isArray(regions)) return res.status(400).json({ error: "regions[] required" });
  res.json({ targets: findExpansionTargets(regions), count: findExpansionTargets(regions).length });
});

router.post("/national/expansion/run", async (req: Request, res: Response) => {
  try {
    const { regions } = req.body ?? {};
    if (!Array.isArray(regions)) return res.status(400).json({ error: "regions[] required" });
    const results = await runNationalExpansion(regions);
    res.json({ deployed: results.length, results });
  } catch (e: any) {
    res.status(500).json({ error: e?.message });
  }
});

router.post("/national/deploy", async (req: Request, res: Response) => {
  try {
    const region = req.body;
    if (!region?.name) return res.status(400).json({ error: "region.name required" });
    const result = await deployRegion(region);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e?.message });
  }
});

router.get("/national/deployment/log", (_req: Request, res: Response) => {
  res.json(getDeploymentLog());
});

// ── Clinic Intelligence ─────────────────────────────────────────────────────
router.post("/intel/shed-load", (req: Request, res: Response) => {
  const { load } = req.body ?? {};
  if (load === undefined) return res.status(400).json({ error: "load required" });
  res.json({ load, action: shedLoad(Number(load)) });
});

router.post("/intel/recover", (req: Request, res: Response) => {
  const { error } = req.body ?? {};
  recoverSystem(error ?? "unknown error");
  res.json({ ok: true });
});

router.post("/intel/broadcast", (req: Request, res: Response) => {
  const { alert } = req.body ?? {};
  if (!alert) return res.status(400).json({ error: "alert required" });
  broadcastNational(String(alert));
  res.json({ ok: true, alert });
});

export default router;
