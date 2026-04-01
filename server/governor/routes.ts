import { Router } from "express";
import { evaluateAgents, getGovernorReport } from "./agentGovernor";
import { restoreAgent, getActiveOverrides, getRerouteLog } from "./rerouter";
import { getGovernorStatus } from "./governorLoop";
import { z } from "zod";

const router = Router();

router.get("/status", (_req, res) => {
  try {
    const status = getGovernorStatus();
    const overrides = getActiveOverrides();
    res.json({ ok: true, ...status, activeOverrides: overrides });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/report", async (_req, res) => {
  try {
    const report = await getGovernorReport();
    res.json({ ok: true, ...report });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/agents", async (_req, res) => {
  try {
    const agents = await evaluateAgents();
    res.json({ ok: true, agents, count: agents.length });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

const restoreSchema = z.object({ agentId: z.string().min(1) });

router.post("/restore", (req, res) => {
  const parsed = restoreSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const restored = restoreAgent(parsed.data.agentId);
  if (!restored) return res.status(404).json({ error: "Agent not found in override registry or already on primary" });
  res.json({ ok: true, message: `Agent ${parsed.data.agentId} restored to primary mode` });
});

router.get("/reroute-log", (req, res) => {
  const limit = Number(req.query.limit ?? 50);
  const log = getRerouteLog(limit);
  res.json({ ok: true, log, count: log.length });
});

export default router;
