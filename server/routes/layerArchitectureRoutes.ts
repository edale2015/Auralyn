import { Router, Request, Response } from "express";
import { requireRole } from "../middleware/requireRole";
import { orchestrationLayer } from "../layers/orchestration/orchestrationLayer";
import { eventBus } from "../realtime/eventBus";
import { getHealthSummary } from "../realtime/systemHealthMonitor";
import { stateLayer } from "../layers/state/stateLayer";
import { analyticsLayer } from "../layers/analytics/analyticsLayer";
import { learningLayer } from "../layers/learning/learningLayer";

const router = Router();

router.post("/api/layer-brain/run", requireRole(["admin", "physician"]), (req: Request, res: Response) => {
  const input = {
    text: req.body.text || "I have a cough and fever",
    source: req.body.source || "web" as any,
    userId: req.body.userId,
  };
  const result = orchestrationLayer.run(input);
  res.json(result);
});

router.get("/api/layer-brain/health", requireRole(["admin", "physician"]), (_req: Request, res: Response) => {
  res.json(getHealthSummary());
});

router.get("/api/layer-brain/events", requireRole(["admin", "physician"]), (req: Request, res: Response) => {
  const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
  res.json({ events: eventBus.getRecentEvents(limit) });
});

router.get("/api/layer-brain/cases", requireRole(["admin", "physician"]), (_req: Request, res: Response) => {
  res.json({ cases: stateLayer.getAllCases() });
});

router.get("/api/layer-brain/analytics", requireRole(["admin", "physician"]), (_req: Request, res: Response) => {
  res.json(analyticsLayer.summarize());
});

router.get("/api/layer-brain/learning", requireRole(["admin", "physician"]), (_req: Request, res: Response) => {
  res.json(learningLayer.learn());
});

router.get("/api/layer-brain/layers", requireRole(["admin", "physician"]), (_req: Request, res: Response) => {
  res.json({
    layers: [
      { id: 1, name: "Interface", module: "interfaceLayer", description: "Handles Telegram, WhatsApp, Web UI inputs", status: "active" },
      { id: 2, name: "Normalization", module: "normalizationLayer", description: "Converts messy input to structured clinical format", status: "active" },
      { id: 3, name: "State", module: "stateLayer", description: "Tracks case progression and history", status: "active" },
      { id: 4, name: "Knowledge", module: "knowledgeLayer", description: "Connects to knowledge graph for diagnosis candidates", status: "active" },
      { id: 5, name: "Safety", module: "safetyLayer", description: "Runs red flag detection and emergency routing", status: "active" },
      { id: 6, name: "Reasoning", module: "reasoningLayer", description: "Bayesian differential, similarity, cluster, entropy analysis", status: "active" },
      { id: 7, name: "Decision", module: "decisionLayer", description: "Produces final diagnosis + disposition", status: "active" },
      { id: 8, name: "Learning", module: "learningLayer", description: "Outcome learning and probability updates", status: "active" },
      { id: 9, name: "Analytics", module: "analyticsLayer", description: "Question impact, clustering, protocol analysis", status: "active" },
      { id: 10, name: "Governance", module: "governanceLayer", description: "Validates deployments and changes", status: "active" },
      { id: 11, name: "Integration", module: "integrationLayer", description: "External APIs — PubMed, EHR connections", status: "active" },
      { id: 12, name: "Orchestration", module: "orchestrationLayer", description: "Clinical Brain — coordinates all layers", status: "active" },
    ],
  });
});

export default router;
