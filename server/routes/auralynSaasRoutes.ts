import { Router, Request, Response } from "express";
import { requireRole } from "../middleware/requireRole";
import { tenantManager } from "../core/tenantManager";
import { billingService } from "../billing/billingService";
import { orchestrationLayer } from "../layers/orchestration/orchestrationLayer";

const router = Router();

router.get("/api/auralyn/tenants", requireRole(["admin"]), (_req: Request, res: Response) => {
  res.json({ tenants: tenantManager.getAll(), summary: tenantManager.getSummary() });
});

router.post("/api/auralyn/tenants", requireRole(["admin"]), (req: Request, res: Response) => {
  const { name, email, plan } = req.body;
  if (!name || !email) return res.status(400).json({ error: "Name and email required" });
  const tenant = tenantManager.create(name, email, plan || "basic");
  res.json(tenant);
});

router.get("/api/auralyn/tenants/:id", requireRole(["admin", "physician"]), (req: Request, res: Response) => {
  const tenant = tenantManager.get(req.params.id);
  if (!tenant) return res.status(404).json({ error: "Tenant not found" });
  res.json(tenant);
});

router.patch("/api/auralyn/tenants/:id/plan", requireRole(["admin"]), (req: Request, res: Response) => {
  const { plan } = req.body;
  const tenant = tenantManager.updatePlan(req.params.id, plan);
  if (!tenant) return res.status(404).json({ error: "Tenant not found" });
  res.json(tenant);
});

router.get("/api/auralyn/billing/summary", requireRole(["admin"]), (_req: Request, res: Response) => {
  res.json(billingService.getRevenueSummary());
});

router.get("/api/auralyn/billing/plans", (_req: Request, res: Response) => {
  res.json(billingService.getPlans());
});

router.get("/api/auralyn/billing/invoices", requireRole(["admin"]), (req: Request, res: Response) => {
  const tenantId = req.query.tenantId as string | undefined;
  res.json({ invoices: billingService.getInvoices(tenantId) });
});

router.get("/api/auralyn/billing/subscriptions", requireRole(["admin"]), (_req: Request, res: Response) => {
  res.json({
    subscriptions: [
      billingService.getSubscription("demo"),
      billingService.getSubscription("city_ent"),
      billingService.getSubscription("rural"),
    ].filter(Boolean),
  });
});

router.post("/api/auralyn/clinical/run", requireRole(["admin", "physician"]), (req: Request, res: Response) => {
  const { text, symptoms } = req.body;
  if (!text && !symptoms) return res.status(400).json({ error: "Provide text or symptoms" });
  const input = text || (symptoms || []).join(", ");
  const result = orchestrationLayer.run(input, "telegram");
  res.json(result);
});

router.get("/api/auralyn/overview", requireRole(["admin"]), (_req: Request, res: Response) => {
  const tenantSummary = tenantManager.getSummary();
  const revenueSummary = billingService.getRevenueSummary();
  res.json({
    platform: "Auralyn Clinical Intelligence Platform",
    version: "1.0.0",
    tenants: tenantSummary,
    revenue: revenueSummary,
    capabilities: [
      "12-Layer Clinical Brain",
      "Predictive Failure Detection",
      "Auto-Debugging Agent",
      "Autonomous Deployment",
      "Self-Improving Learning",
      "Multi-Agent Coordination",
      "Clinical Knowledge Graph",
      "Reasoning Replay",
      "Question Optimization",
      "Safety Scoring",
    ],
    deployment: { phase: "Phase 1", hosting: "Replit", database: "In-Memory", status: "Active" },
  });
});

export default router;
