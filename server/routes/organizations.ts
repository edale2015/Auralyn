import { Router } from "express";
import { requireRole } from "../middleware/requireRole";
import { listOrganizations, getOrganization, createOrganization } from "../services/organizations/organizationStore";

export const organizationsRouter = Router();

organizationsRouter.get("/", requireRole(["admin"]), async (_req, res) => {
  res.json({ organizations: listOrganizations() });
});

organizationsRouter.get("/:orgId", requireRole(["admin"]), async (req, res) => {
  const org = getOrganization(req.params.orgId);
  if (!org) { res.status(404).json({ error: "Organization not found" }); return; }
  res.json(org);
});

organizationsRouter.post("/", requireRole(["admin"]), async (req, res) => {
  try {
    const org = createOrganization(req.body);
    res.json(org);
  } catch (err: any) { res.status(500).json({ error: err?.message ?? "Failed" }); }
});
