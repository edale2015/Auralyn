import { Router, Request, Response } from "express";

import { findByVision, rememberSelector, recallSelector, diagnoseUIError, buildHeatmap, fallbackChain, rememberUI, recallUI } from "./automation/visionAgent";
import { safeECWAutomation, dualWriteEHR } from "./automation/ecwPilot";
import { optimizeRevenue, analyzeRevenue, enterpriseOptimize, learnFromDenials, prioritizedWrites } from "./revenue/revenueOptimizer";
import { orchestrate, systemScore, routeConnector, cacheAction, getCachedAction, clearActionCache } from "./clinical/orchestrator";

const router = Router();

// ── Vision Agent ──────────────────────────────────────────────────────────────
router.post("/vision/find", async (req: Request, res: Response) => {
  const { screenshot, goal } = req.body ?? {};
  if (!screenshot || !goal) return res.status(400).json({ error: "screenshot and goal required" });
  const coords = await findByVision(String(screenshot), String(goal));
  res.json({ coords });
});

router.post("/vision/diagnose", (req: Request, res: Response) => {
  const { err } = req.body ?? {};
  res.json({ diagnosis: diagnoseUIError(String(err ?? "")) });
});

router.post("/vision/heatmap", (req: Request, res: Response) => {
  const { events } = req.body ?? {};
  if (!Array.isArray(events)) return res.status(400).json({ error: "events[] required" });
  res.json({ heatmap: buildHeatmap(events) });
});

// ── Selector Memory ───────────────────────────────────────────────────────────
router.post("/vision/memory/selector", (req: Request, res: Response) => {
  const { label, selector } = req.body ?? {};
  if (!label || !selector) return res.status(400).json({ error: "label and selector required" });
  rememberSelector(String(label), String(selector));
  res.json({ ok: true });
});

router.get("/vision/memory/selector/:label", (req: Request, res: Response) => {
  res.json({ selector: recallSelector(req.params.label) ?? null });
});

router.post("/vision/memory/ui", (req: Request, res: Response) => {
  const { screen, mapping } = req.body ?? {};
  if (!screen) return res.status(400).json({ error: "screen required" });
  rememberUI(String(screen), mapping);
  res.json({ ok: true });
});

router.get("/vision/memory/ui/:screen", (req: Request, res: Response) => {
  res.json({ mapping: recallUI(req.params.screen) ?? null });
});

// ── Fallback Chain ────────────────────────────────────────────────────────────
router.post("/vision/fallback-chain", async (req: Request, res: Response) => {
  const { patientId, disposition } = req.body ?? {};
  if (!patientId || !disposition) return res.status(400).json({ error: "patientId and disposition required" });
  const result = await fallbackChain({ patientId, disposition });
  res.json({ routed: result });
});

// ── ECW Pilot ────────────────────────────────────────────────────────────────
router.post("/ecw/pilot/safe", async (req: Request, res: Response) => {
  const { template } = req.body ?? {};
  if (!template) return res.status(400).json({ error: "template required" });
  const result = await safeECWAutomation(template);
  res.json(result);
});

router.post("/ecw/pilot/dual-write", async (req: Request, res: Response) => {
  const { patientId, disposition, vitals, template } = req.body ?? {};
  if (!patientId || !disposition) return res.status(400).json({ error: "patientId and disposition required" });
  const result = await dualWriteEHR({ patientId, disposition, vitals, template });
  res.json(result);
});

// ── Revenue Optimizer ─────────────────────────────────────────────────────────
router.post("/revenue/optimize", (req: Request, res: Response) => {
  const { claim } = req.body ?? {};
  if (!claim) return res.status(400).json({ error: "claim required" });
  res.json({ claim: optimizeRevenue(claim) });
});

router.post("/revenue/optimize/enterprise", (req: Request, res: Response) => {
  const { claim } = req.body ?? {};
  if (!claim) return res.status(400).json({ error: "claim required" });
  res.json({ claim: enterpriseOptimize(claim) });
});

router.post("/revenue/analyze", (req: Request, res: Response) => {
  const { claims } = req.body ?? {};
  if (!Array.isArray(claims)) return res.status(400).json({ error: "claims[] required" });
  res.json({ total: analyzeRevenue(claims) });
});

router.post("/revenue/denials/learn", (req: Request, res: Response) => {
  const { claims } = req.body ?? {};
  if (!Array.isArray(claims)) return res.status(400).json({ error: "claims[] required" });
  res.json({ patterns: learnFromDenials(claims) });
});

// ── Central Orchestrator ──────────────────────────────────────────────────────
router.post("/orchestrate", async (req: Request, res: Response) => {
  const patient = req.body ?? {};
  if (!patient.patientId) return res.status(400).json({ error: "patientId required" });
  try {
    const result = await orchestrate(patient);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e?.message });
  }
});

router.post("/system/score", (req: Request, res: Response) => {
  const { errorRate = 0, latency = 0, denialRate = 0 } = req.body ?? {};
  res.json({ score: systemScore({ errorRate: Number(errorRate), latency: Number(latency), denialRate: Number(denialRate) }) });
});

// ── Connector Router ──────────────────────────────────────────────────────────
router.post("/connector/route", async (req: Request, res: Response) => {
  const { type, payload } = req.body ?? {};
  if (!type) return res.status(400).json({ error: "type required" });
  const result = await routeConnector(String(type), payload);
  res.json({ result });
});

// ── Action Cache ──────────────────────────────────────────────────────────────
router.post("/cache/action", (req: Request, res: Response) => {
  const { key, result } = req.body ?? {};
  if (!key) return res.status(400).json({ error: "key required" });
  cacheAction(String(key), result);
  res.json({ ok: true });
});

router.get("/cache/action/:key", (req: Request, res: Response) => {
  res.json({ cached: getCachedAction(req.params.key) ?? null });
});

router.delete("/cache/action", (_req: Request, res: Response) => {
  clearActionCache();
  res.json({ ok: true });
});

export default router;
