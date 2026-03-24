import { Router, Request, Response } from "express";
import { getRegionSummary, selectRegion, markRegionHealth } from "../infra/regionRegistry";
import { getSREState, checkSLABreach, getErrorBudget } from "../sre/slaEngine";
import { getDebugLog } from "../ai/autoDebugger";
import { getAgentSummary, registerAgent, heartbeat, setAgentHealth } from "../governance/agentRegistry";
import { getAuditLog } from "../governance/auditAgent";
import { getIncidents, getOpenIncidents, resolveIncident } from "../incident/incidentCommander";
import { getTwin } from "../twin/digitalTwin";
import { predictFailure } from "../predictive/predictiveEngine";
import { getMetrics } from "../monitoring/metricsStore";

const router = Router();

router.get("/regions", (_req: Request, res: Response) => {
  res.json({ ok: true, regions: getRegionSummary() });
});

router.get("/regions/best", (req: Request, res: Response) => {
  try {
    const region = selectRegion((req.query.prefer as string) ?? undefined);
    res.json({ ok: true, region });
  } catch (e: any) {
    res.status(503).json({ ok: false, error: e.message });
  }
});

router.patch("/regions/:id/health", (req: Request, res: Response) => {
  const { id } = req.params;
  const { health, latencyMs } = req.body;
  markRegionHealth(id, health, latencyMs);
  res.json({ ok: true, id, health });
});

router.get("/sre", (_req: Request, res: Response) => {
  const m = getMetrics();
  const breach = checkSLABreach(m);
  res.json({
    ok: true,
    ...getSREState(),
    breach: breach ?? "none",
    slaConfig: { uptimeTarget: 0.999, latencyTarget: 1000 },
  });
});

router.get("/debug/log", (_req: Request, res: Response) => {
  res.json({ ok: true, entries: getDebugLog() });
});

router.get("/governance/agents", (_req: Request, res: Response) => {
  res.json({ ok: true, summary: getAgentSummary() });
});

router.post("/governance/agents", (req: Request, res: Response) => {
  const { id, role, health } = req.body;
  if (!id || !role) return res.status(400).json({ ok: false, error: "id and role required" });
  registerAgent({ id, role, health: health ?? "healthy", lastAction: null });
  return res.json({ ok: true, id });
});

router.post("/governance/agents/:id/heartbeat", (req: Request, res: Response) => {
  heartbeat(req.params.id, req.body.action ?? null);
  res.json({ ok: true });
});

router.patch("/governance/agents/:id/health", (req: Request, res: Response) => {
  setAgentHealth(req.params.id, req.body.health);
  res.json({ ok: true });
});

router.get("/governance/audit", (_req: Request, res: Response) => {
  res.json({ ok: true, findings: getAuditLog() });
});

router.get("/incidents", (_req: Request, res: Response) => {
  res.json({ ok: true, incidents: getIncidents() });
});

router.get("/incidents/open", (_req: Request, res: Response) => {
  res.json({ ok: true, incidents: getOpenIncidents() });
});

router.post("/incidents/:id/resolve", (req: Request, res: Response) => {
  const resolved = resolveIncident(req.params.id);
  res.json({ ok: resolved, id: req.params.id });
});

router.get("/twin", (_req: Request, res: Response) => {
  res.json({ ok: true, twin: getTwin() });
});

router.get("/predict", (_req: Request, res: Response) => {
  res.json({ ok: true, prediction: predictFailure() });
});

export default router;
