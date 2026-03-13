import { Router } from "express";
import {
  listTenants,
  getTenant,
  createTenant,
  updateTenant,
  deleteTenant,
  getTenantSummary,
  ALL_FEATURES,
} from "../sl8/tenantOrchestratorService";

const router = Router();

router.get("/api/sl8/tenants", async (_req, res) => {
  try {
    const tenants = await listTenants();
    const summary = await getTenantSummary();
    res.json({ tenants, summary });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/api/sl8/tenants/summary", async (_req, res) => {
  try {
    res.json(await getTenantSummary());
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/api/sl8/tenants/:id", async (req, res) => {
  try {
    const tenant = await getTenant(req.params.id);
    if (!tenant) return res.status(404).json({ error: "Not found" });
    res.json(tenant);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/api/sl8/tenants", async (req, res) => {
  try {
    const { siteId, name, plan, status, adminEmail, region, config } = req.body;
    if (!siteId || !name || !plan || !adminEmail) {
      return res.status(400).json({ error: "siteId, name, plan, adminEmail are required" });
    }
    const tenant = await createTenant({ siteId, name, plan, status: status ?? "trial", adminEmail, region: region ?? "us-east-1", config: config ?? { maxCasesPerMonth: 100, maxPhysicians: 2, goldenThreshold: 0.75, maxCostPerCase: 0.08, retentionDays: 365, features: [], branding: { clinicName: name, primaryColor: "#2563eb", logoUrl: "" }, allowedComplaints: [], channels: [] } });
    res.json(tenant);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.patch("/api/sl8/tenants/:id", async (req, res) => {
  try {
    const updated = await updateTenant(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json(updated);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.delete("/api/sl8/tenants/:id", async (req, res) => {
  try {
    const ok = await deleteTenant(req.params.id);
    if (!ok) return res.status(404).json({ error: "Not found" });
    res.json({ deleted: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
