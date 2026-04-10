import { Router, Request, Response } from "express";

import { startClinicLoop, stopClinicLoop, getClinicLoopStatus, enqueuePatient } from "./pilot/realClinicLoop";
import { submitRealClaim, estimateReimbursement } from "./revenue/payerAPI";
import { nationalRollout, scoreExpansionTarget } from "./national/expansionEngine";
import { matchPatient, rankProviders } from "./marketplace/matcher";
import { runUIAutomation, trackAutomation, syncEHRs, healAndRetry, runParallel } from "./automation/uiEngine";

const router = Router();

// ── Real Clinic Loop ──────────────────────────────────────────────────────────
router.post("/clinic-loop/start", (_req: Request, res: Response) => {
  startClinicLoop();
  res.json({ ok: true, status: getClinicLoopStatus() });
});

router.post("/clinic-loop/stop", (_req: Request, res: Response) => {
  stopClinicLoop();
  res.json({ ok: true, status: getClinicLoopStatus() });
});

router.get("/clinic-loop/status", (_req: Request, res: Response) => {
  res.json(getClinicLoopStatus());
});

router.post("/clinic-loop/enqueue", (req: Request, res: Response) => {
  const { patientId, complaint } = req.body ?? {};
  if (!patientId || !complaint) return res.status(400).json({ error: "patientId and complaint required" });
  enqueuePatient(req.body);
  res.json({ ok: true, status: getClinicLoopStatus() });
});

// ── Real Payer API ─────────────────────────────────────────────────────────────
router.post("/revenue/payer/submit", async (req: Request, res: Response) => {
  const claim = req.body ?? {};
  if (!claim.patientId) return res.status(400).json({ error: "patientId required" });
  const result = await submitRealClaim(claim);
  res.json(result);
});

router.post("/revenue/payer/estimate", (req: Request, res: Response) => {
  const { cpt, insurance } = req.body ?? {};
  if (!cpt) return res.status(400).json({ error: "cpt required" });
  res.json({ estimate: estimateReimbursement(String(cpt), String(insurance ?? "unknown")) });
});

// ── National Rollout ─────────────────────────────────────────────────────────
router.post("/national/rollout", async (req: Request, res: Response) => {
  const { regions } = req.body ?? {};
  if (!Array.isArray(regions)) return res.status(400).json({ error: "regions[] required" });
  const result = await nationalRollout(regions);
  res.json(result);
});

router.post("/national/score", (req: Request, res: Response) => {
  const region = req.body ?? {};
  if (!region.name) return res.status(400).json({ error: "region name required" });
  res.json({ score: scoreExpansionTarget(region) });
});

// ── Marketplace ───────────────────────────────────────────────────────────────
router.post("/marketplace/match", (req: Request, res: Response) => {
  const { patient, providers } = req.body ?? {};
  if (!patient || !Array.isArray(providers)) return res.status(400).json({ error: "patient and providers[] required" });
  const match = matchPatient(patient, providers);
  res.json({ match });
});

router.post("/marketplace/rank", (req: Request, res: Response) => {
  const { patient, providers } = req.body ?? {};
  if (!patient || !Array.isArray(providers)) return res.status(400).json({ error: "patient and providers[] required" });
  res.json({ providers: rankProviders(patient, providers) });
});

// ── UI Automation ─────────────────────────────────────────────────────────────
router.post("/ui/run", async (req: Request, res: Response) => {
  const { template } = req.body ?? {};
  if (!template) return res.status(400).json({ error: "template required" });
  const result = await runUIAutomation(template);
  res.json(result);
});

router.post("/ui/run-parallel", async (req: Request, res: Response) => {
  const { templates } = req.body ?? {};
  if (!Array.isArray(templates)) return res.status(400).json({ error: "templates[] required" });
  const results = await runParallel(templates);
  res.json({ results });
});

router.post("/ui/heal-retry", async (req: Request, res: Response) => {
  const { template } = req.body ?? {};
  if (!template) return res.status(400).json({ error: "template required" });
  const result = await healAndRetry(template);
  res.json({ ...result, tracked: trackAutomation(result) });
});

router.post("/ui/sync-ehrs", async (req: Request, res: Response) => {
  const { patientId, disposition, vitals } = req.body ?? {};
  if (!patientId || !disposition) return res.status(400).json({ error: "patientId and disposition required" });
  const result = await syncEHRs({ patientId, disposition, vitals });
  res.json(result);
});

export default router;
