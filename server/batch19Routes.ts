import { Router, Request, Response } from "express";
import type { Server } from "http";

import { startControlStream } from "./control/controlStream";
import {
  clinicalState, automationState, revenueState, visionState,
  integrationState, getUnifiedState, healthScore,
  smartSecondary, instantSummary, autoRecover,
  runTask, nextStep, globalTrend, systemInsight,
} from "./control/modulesState";
import { autoScale, routeGlobal, getConfiguredRegions } from "./control/regionCluster";
import { runLiveSystem } from "./pilot/liveRealSystem";
import { submitLiveClaim, optimizeClaim } from "./revenue/liveBilling";
import { publishUpdate } from "./control/systemBus";
import { deployRegion } from "./national/rolloutEngine";
import { repairTemplate } from "./control/systemControls";

const router = Router();

// ── Unified System State ──────────────────────────────────────────────────────
router.get("/control/state/unified", async (_req: Request, res: Response) => {
  const base   = getUnifiedState();
  const integrations = await integrationState();
  const score  = healthScore(base);
  res.json({ ...base, integrations, score });
});

router.get("/control/modules/clinical",    (_req, res) => res.json(clinicalState()));
router.get("/control/modules/automation",  (_req, res) => res.json(automationState()));
router.get("/control/modules/revenue",     (_req, res) => res.json(revenueState()));
router.get("/control/modules/vision",      (_req, res) => res.json(visionState()));
router.get("/control/modules/integration", async (_req, res) => res.json(await integrationState()));

// ── Control Actions ────────────────────────────────────────────────────────────
router.post("/control/action", async (req: Request, res: Response) => {
  const { action, data } = req.body ?? {};

  switch (action) {
    case "runSimulation": {
      const { runSimulation } = await import("./simulation/liveSimulator");
      await runSimulation(data?.n ?? 1000);
      break;
    }
    case "stressTest": {
      const { runStressTest } = await import("./simulation/liveSimulator");
      await runStressTest(data?.n ?? 50_000);
      break;
    }
    case "repairAutomation": {
      repairTemplate(data?.id ?? "auto");
      break;
    }
    case "deployRegion": {
      await deployRegion(data ?? { name: "new-region", load: 0.3, population: 1_000_000 });
      break;
    }
    case "publishUpdate": {
      publishUpdate(data ?? { type: "manual-trigger" });
      break;
    }
    default:
      return res.status(400).json({ error: `Unknown action: ${action}` });
  }

  res.json({ ok: true, action });
});

// ── System Health + Insight ────────────────────────────────────────────────────
router.post("/control/health-score", (req: Request, res: Response) => {
  const state = req.body ?? {};
  if (!state.clinical || !state.revenue || !state.vision) {
    return res.status(400).json({ error: "clinical, revenue, vision required" });
  }
  res.json({ score: healthScore(state) });
});

router.post("/control/insight", (req: Request, res: Response) => {
  const state = req.body ?? {};
  res.json({ insight: systemInsight(state) });
});

router.post("/control/recover", (req: Request, res: Response) => {
  const state = req.body ?? {};
  res.json({ actions: autoRecover(state) });
});

// ── Universal Task Orchestrator ────────────────────────────────────────────────
router.post("/task/run", async (req: Request, res: Response) => {
  const { type, data } = req.body ?? {};
  if (!type) return res.status(400).json({ error: "type required" });
  const result = await runTask(String(type), data);
  res.json({ result });
});

// ── Patient Navigator + Trends ────────────────────────────────────────────────
router.post("/navigator/next-step", (req: Request, res: Response) => {
  const { patient } = req.body ?? {};
  res.json({ step: nextStep(patient ?? {}) });
});

router.post("/trends/global", (req: Request, res: Response) => {
  const { data } = req.body ?? {};
  if (!Array.isArray(data)) return res.status(400).json({ error: "data[] required" });
  res.json({ trends: globalTrend(data) });
});

// ── Smart Secondary Question + Instant Summary ────────────────────────────────
router.post("/clinical/smart-secondary", (req: Request, res: Response) => {
  const ctx = req.body ?? {};
  res.json({ question: smartSecondary(ctx) });
});

router.post("/clinical/instant-summary", (req: Request, res: Response) => {
  res.json({ summary: instantSummary(req.body ?? {}) });
});

// ── Live Real System ───────────────────────────────────────────────────────────
router.post("/live/run", async (req: Request, res: Response) => {
  const { patientId, complaint } = req.body ?? {};
  if (!patientId || !complaint) return res.status(400).json({ error: "patientId and complaint required" });
  try {
    const result = await runLiveSystem(req.body);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e?.message });
  }
});

// ── Live Billing ───────────────────────────────────────────────────────────────
router.post("/revenue/billing/submit", async (req: Request, res: Response) => {
  const claim = req.body ?? {};
  if (!claim.patientId) return res.status(400).json({ error: "patientId required" });
  const result = await submitLiveClaim(claim);
  res.json(result);
});

router.post("/revenue/billing/optimize", (req: Request, res: Response) => {
  const { claim } = req.body ?? {};
  if (!claim) return res.status(400).json({ error: "claim required" });
  res.json({ claim: optimizeClaim(claim) });
});

// ── Multi-Region Cluster ───────────────────────────────────────────────────────
router.post("/region/route", async (req: Request, res: Response) => {
  try {
    const result = await routeGlobal(req.body);
    res.json(result);
  } catch (e: any) {
    res.status(503).json({ error: e?.message });
  }
});

router.post("/region/scale", (req: Request, res: Response) => {
  const { queueDepth } = req.body ?? {};
  if (queueDepth == null) return res.status(400).json({ error: "queueDepth required" });
  res.json({ instances: autoScale(Number(queueDepth)) });
});

router.get("/region/configured", (_req, res) => {
  res.json({ regions: getConfiguredRegions() });
});

export function initBatch19(server: Server): void {
  startControlStream(server);
  console.log("[Batch19] WebSocket live stream started");
}

export default router;
