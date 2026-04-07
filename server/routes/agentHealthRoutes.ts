// ── Agent Health & Self-Healing Routes ────────────────────────────────────────
//
// GET  /api/agents/health              — all agent health records (Redis-backed)
// GET  /api/agents/health/:agent       — single agent health record
// GET  /api/agents/weights             — all routing weights
// POST /api/agents/health/reset/:agent — reset health counters (admin)
// GET  /api/agents/metrics             — in-memory orchestrator metrics (latency, etc.)

import { Router }           from "express";
import { selfHealingEngine } from "../agents/selfHealingEngine";
import { weightAdapter }     from "../agents/weightAdapter";
import { getAgentMetrics, getRegisteredAgents } from "../agents/orchestrator";
import { requireRole }       from "../middleware/requireRole";

export const agentHealthRouter = Router();

// ── GET /health ───────────────────────────────────────────────────────────────
agentHealthRouter.get(
  "/health",
  requireRole(["admin", "physician"]),
  async (_req, res) => {
    const all = await selfHealingEngine.getAllAgentsHealth();
    res.json({ agents: all });
  }
);

// ── GET /health/:agent ────────────────────────────────────────────────────────
agentHealthRouter.get(
  "/health/:agent",
  requireRole(["admin", "physician"]),
  async (req, res) => {
    const record = await selfHealingEngine.getHealth(req.params.agent);
    res.json(record);
  }
);

// ── GET /weights ──────────────────────────────────────────────────────────────
agentHealthRouter.get(
  "/weights",
  requireRole(["admin", "physician"]),
  async (_req, res) => {
    const weights = await weightAdapter.getAllWeights();
    res.json({ weights });
  }
);

// ── POST /health/reset/:agent ─────────────────────────────────────────────────
agentHealthRouter.post(
  "/health/reset/:agent",
  requireRole(["admin"]),
  async (req, res) => {
    await selfHealingEngine.resetAgent(req.params.agent);
    res.json({ ok: true, agent: req.params.agent });
  }
);

// ── GET /metrics ──────────────────────────────────────────────────────────────
// Returns in-memory latency percentiles + success rates for registered agents.
agentHealthRouter.get(
  "/metrics",
  requireRole(["admin", "physician"]),
  async (_req, res) => {
    res.json({
      registered: getRegisteredAgents(),
      metrics:    getAgentMetrics(),
    });
  }
);
