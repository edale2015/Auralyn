import { Router } from "express";
import { z } from "zod";
import { requireRole } from "../middleware/requireRole";
import { toggleAgent, getAgentConfig, bulkToggleAgents } from "../agents/agentConfig";

const router = Router();

router.get("/config", requireRole(["admin", "physician"]), (_req, res) => {
  res.json(getAgentConfig());
});

const toggleSchema = z.object({
  name: z.string().min(1),
  enabled: z.boolean(),
  reason: z.string().optional(),
});

router.post("/toggle", requireRole(["admin"]), (req, res) => {
  const parsed = toggleSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const result = toggleAgent(parsed.data.name, parsed.data.enabled, {
    by: (req as any).user?.email || "admin",
    reason: parsed.data.reason,
  });

  if (!result.success) {
    return res.status(400).json(result);
  }

  res.json({ ...result, agent: parsed.data.name, enabled: parsed.data.enabled });
});

const bulkToggleSchema = z.object({
  updates: z.array(z.object({
    name: z.string().min(1),
    enabled: z.boolean(),
  })).min(1),
});

router.post("/bulk-toggle", requireRole(["admin"]), (req, res) => {
  const parsed = bulkToggleSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const results = bulkToggleAgents(parsed.data.updates, {
    by: (req as any).user?.email || "admin",
  });

  res.json({ results });
});

export default router;
