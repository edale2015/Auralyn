// ── Circuit Breaker Control Panel Routes ──────────────────────────────────────
//
// Operator-facing API to inspect and override distributed circuit breaker state.
// All write operations (reset, forceOpen) require admin role.
//
// GET  /api/circuit-breakers           — list all known breakers + state
// GET  /api/circuit-breakers/:agent    — single breaker state
// POST /api/circuit-breakers/reset/:agent    — close + reset counters
// POST /api/circuit-breakers/force-open/:agent — manually open a breaker

import { Router }               from "express";
import { redisCircuitBreaker }  from "../infra/redisCircuitBreaker";
import { getAllBreakerStates }   from "../utils/circuitBreaker";
import { requireRole }           from "../middleware/requireRole";

export const circuitBreakerRouter = Router();

// ── GET / — all breakers ──────────────────────────────────────────────────────
circuitBreakerRouter.get(
  "/",
  requireRole(["admin", "physician"]),
  async (_req, res) => {
    // Merge Redis distributed state with in-memory service breakers
    const [distributedStates, inMemoryStates] = await Promise.all([
      redisCircuitBreaker.listAll(),
      Promise.resolve(getAllBreakerStates()),
    ]);

    // Build unified list keyed by agent name — Redis takes precedence
    const map = new Map<string, any>(
      inMemoryStates.map(s => [s.name, {
        agent:        s.name,
        state:        s.state,
        failureCount: s.failures,
        lastFailureAt: s.lastFailAt,
        source:       "in-memory",
      }])
    );
    for (const s of distributedStates) {
      map.set(s.agent, { ...s, source: "redis" });
    }

    res.json({ breakers: Array.from(map.values()) });
  }
);

// ── GET /:agent ───────────────────────────────────────────────────────────────
circuitBreakerRouter.get(
  "/:agent",
  requireRole(["admin", "physician"]),
  async (req, res) => {
    const state = await redisCircuitBreaker.getState(req.params.agent);
    res.json(state);
  }
);

// ── POST /reset/:agent ────────────────────────────────────────────────────────
circuitBreakerRouter.post(
  "/reset/:agent",
  requireRole(["admin"]),
  async (req, res) => {
    try {
      await redisCircuitBreaker.reset(req.params.agent);
      res.json({ ok: true, agent: req.params.agent, action: "reset" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// ── POST /force-open/:agent ───────────────────────────────────────────────────
circuitBreakerRouter.post(
  "/force-open/:agent",
  requireRole(["admin"]),
  async (req, res) => {
    try {
      await redisCircuitBreaker.forceOpen(req.params.agent);
      res.json({ ok: true, agent: req.params.agent, action: "force-open" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);
