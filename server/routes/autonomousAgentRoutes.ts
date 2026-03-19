import { Router } from "express";
import { z } from "zod";
import { requireRole } from "../middleware/requireRole";
import { runAutonomousAgents, initAutonomousAgents } from "../pipeline/autonomousAgents";
import { getRegisteredAgents } from "../agents/orchestrator";
import { getAgentLog, getAgentStats, resetAgentStats } from "../agents/tracking";
import { getEventLog, getSubscribers } from "../agents/eventBus";
import { getFollowUpQueue, cancelFollowUp } from "../agents/followUpAgent";

const router = Router();

const runSchema = z.object({
  text: z.string().min(1),
  patientId: z.string().optional(),
  channel: z.enum(["web", "telegram", "whatsapp"]).optional().default("web"),
  answers: z.record(z.string()).optional(),
  metadata: z.record(z.any()).optional(),
});

router.post("/run", requireRole(["admin", "physician"]), async (req, res) => {
  const parsed = runSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  try {
    const result = await runAutonomousAgents(parsed.data);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: "Agent pipeline failed", message: err.message });
  }
});

router.get("/agents", requireRole(["admin", "physician"]), (_req, res) => {
  initAutonomousAgents();
  res.json({ agents: getRegisteredAgents() });
});

router.get("/stats", requireRole(["admin", "physician"]), (_req, res) => {
  res.json(getAgentStats());
});

router.get("/log", requireRole(["admin"]), (req, res) => {
  const limit = Number(req.query.limit ?? 100);
  res.json(getAgentLog(limit));
});

router.delete("/stats", requireRole(["admin"]), (_req, res) => {
  resetAgentStats();
  res.json({ reset: true });
});

router.get("/events", requireRole(["admin"]), (req, res) => {
  const limit = Number(req.query.limit ?? 100);
  res.json({ events: getEventLog(limit), subscribers: getSubscribers() });
});

router.get("/followups", requireRole(["admin", "physician"]), (req, res) => {
  const limit = Number(req.query.limit ?? 50);
  res.json(getFollowUpQueue(limit));
});

router.post("/followups/:patientId/cancel", requireRole(["admin", "physician"]), (req, res) => {
  const cancelled = cancelFollowUp(req.params.patientId);
  if (!cancelled) {
    return res.status(404).json({ error: "No pending follow-up found for this patient" });
  }
  res.json({ cancelled: true, patientId: req.params.patientId });
});

const batchSchema = z.object({
  cases: z.array(z.object({
    text: z.string().min(1),
    patientId: z.string().optional(),
    channel: z.enum(["web", "telegram", "whatsapp"]).optional().default("web"),
  })).min(1).max(50),
});

router.post("/batch", requireRole(["admin"]), async (req, res) => {
  const parsed = batchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const results = [];
  for (const c of parsed.data.cases) {
    try {
      const result = await runAutonomousAgents(c);
      results.push({ patientId: c.patientId, status: "ok", result });
    } catch (err: any) {
      results.push({ patientId: c.patientId, status: "error", error: err.message });
    }
  }
  res.json({ processed: results.length, results });
});

export default router;
