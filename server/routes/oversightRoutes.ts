/**
 * Oversight Routes
 *
 * POST /api/oversight/run
 *   Runs the autonomous oversight agent against a set of outcomes and system
 *   metrics. Returns an OversightDecision with alerts, recommended actions,
 *   and severity level.
 */

import express from "express";
import { runOversightAgent, type OversightInput } from "../oversight/autonomousOversightAgent";
import { randomUUID } from "crypto";

const router = express.Router();

router.post("/oversight/run", async (req, res) => {
  const traceId = req.headers["x-trace-id"] as string || randomUUID();

  const { input } = req.body as { input?: OversightInput };

  if (!input) {
    res.status(400).json({ error: "Missing input payload" });
    return;
  }

  // Validate required fields
  if (!Array.isArray(input.outcomes)) {
    res.status(400).json({ error: "input.outcomes must be an array" });
    return;
  }
  if (typeof input.systemMetrics !== "object") {
    res.status(400).json({ error: "input.systemMetrics is required" });
    return;
  }

  try {
    const decision = await runOversightAgent(input, traceId);
    res.json(decision);
  } catch (err) {
    console.error("[OversightRoutes] Error:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
