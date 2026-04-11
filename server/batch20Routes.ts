import { Router, Request, Response } from "express";

import { connectHospital, connectPayer, safeExternalWrite } from "./integrations/liveAdapters";
import { pickBestRegion, rebalance, networkHealth } from "./national/networkController";
import { matchProvider, bookProvider, rankProvidersSLA } from "./marketplace/engine";
import { optimizeWorkflow, applyOptimization, projectRevenue } from "./optimization/optimizer";
import {
  nextBestQuestion, oneGlance, retry, zAnomaly, zScore, universalWrite,
} from "./utils/advancedUtils";

const router = Router();

// ── Live Adapters ────────────────────────────────────────────────────────────
router.post("/integrations/hospital", async (req: Request, res: Response) => {
  const patient = req.body ?? {};
  if (!patient.patientId) return res.status(400).json({ error: "patientId required" });
  const r = await connectHospital(patient);
  res.status(r.ok ? 200 : 502).json(r);
});

router.post("/integrations/payer", async (req: Request, res: Response) => {
  const claim = req.body ?? {};
  if (!claim.patientId) return res.status(400).json({ error: "patientId required" });
  const r = await connectPayer(claim);
  res.status(r.ok ? 200 : 502).json(r);
});

router.post("/integrations/safe-write", async (req: Request, res: Response) => {
  const { type, payload } = req.body ?? {};
  if (!type || !payload) return res.status(400).json({ error: "type and payload required" });
  const fn = type === "hospital" ? () => connectHospital(payload) : () => connectPayer(payload);
  const errors: string[] = [];
  const r = await safeExternalWrite(fn, err => errors.push(err));
  res.json({ ...r, errors });
});

// ── National Network Controller ───────────────────────────────────────────────
router.post("/network/best", (req: Request, res: Response) => {
  const { regions } = req.body ?? {};
  if (!Array.isArray(regions)) return res.status(400).json({ error: "regions[] required" });
  res.json({ best: pickBestRegion(regions) });
});

router.post("/network/rebalance", (req: Request, res: Response) => {
  const { regions } = req.body ?? {};
  if (!Array.isArray(regions)) return res.status(400).json({ error: "regions[] required" });
  res.json({ actions: rebalance(regions) });
});

router.post("/network/health", (req: Request, res: Response) => {
  const { regions } = req.body ?? {};
  if (!Array.isArray(regions)) return res.status(400).json({ error: "regions[] required" });
  res.json(networkHealth(regions));
});

// ── Marketplace Engine ────────────────────────────────────────────────────────
router.post("/marketplace/engine/match", (req: Request, res: Response) => {
  const { patient, providers } = req.body ?? {};
  if (!patient || !Array.isArray(providers)) return res.status(400).json({ error: "patient and providers[] required" });
  res.json({ match: matchProvider(patient, providers) });
});

router.post("/marketplace/engine/rank", (req: Request, res: Response) => {
  const { patient, providers } = req.body ?? {};
  if (!patient || !Array.isArray(providers)) return res.status(400).json({ error: "patient and providers[] required" });
  res.json({ ranked: rankProvidersSLA(patient, providers) });
});

router.post("/marketplace/engine/book", async (req: Request, res: Response) => {
  const { providerId, patientId } = req.body ?? {};
  if (!providerId || !patientId) return res.status(400).json({ error: "providerId and patientId required" });
  const r = await bookProvider(String(providerId), String(patientId));
  res.json(r);
});

// ── Workflow Optimizer ────────────────────────────────────────────────────────
router.post("/optimization/analyze", (req: Request, res: Response) => {
  const { visits } = req.body ?? {};
  if (!Array.isArray(visits)) return res.status(400).json({ error: "visits[] required" });
  const metrics = optimizeWorkflow(visits);
  const actions = applyOptimization(metrics);
  res.json({ metrics, actions });
});

router.post("/optimization/project", (req: Request, res: Response) => {
  const { visits, multiplier } = req.body ?? {};
  if (!Array.isArray(visits)) return res.status(400).json({ error: "visits[] required" });
  res.json({ projected: projectRevenue(visits, Number(multiplier ?? 1)) });
});

// ── Clinical Utilities ────────────────────────────────────────────────────────
router.post("/clinical/next-best-question", (req: Request, res: Response) => {
  const { dx, qs } = req.body ?? {};
  if (!Array.isArray(dx) || !Array.isArray(qs)) return res.status(400).json({ error: "dx[] and qs[] required" });
  res.json({ question: nextBestQuestion(dx, qs) });
});

router.post("/clinical/one-glance", (req: Request, res: Response) => {
  const card = req.body ?? {};
  res.json({ glance: oneGlance(card) });
});

// ── Anomaly Detection ─────────────────────────────────────────────────────────
router.post("/analytics/z-anomaly", (req: Request, res: Response) => {
  const { series, threshold } = req.body ?? {};
  if (!Array.isArray(series)) return res.status(400).json({ error: "series[] required" });
  res.json({
    anomaly: zAnomaly(series, threshold ? Number(threshold) : 3),
    zScore:  zScore(series),
  });
});

// ── Universal Write ───────────────────────────────────────────────────────────
router.post("/integrations/universal-write", async (req: Request, res: Response) => {
  const data = req.body ?? {};
  if (!data.patientId) return res.status(400).json({ error: "patientId required" });
  const channel = await universalWrite(data);
  res.json({ channel });
});

export default router;
