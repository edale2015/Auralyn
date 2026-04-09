/**
 * Regional Orchestration Routes
 *
 * POST /api/regional/orchestrate
 *   Runs the full regional orchestrator — capacity federation, geo routing,
 *   admission risk, bounceback prediction, callback planning, and outbreak
 *   detection across all facilities in the network.
 */

import express from "express";
import {
  runRegionalOrchestration,
  type RegionalOrchestrationInput,
} from "../regional/regionalOrchestrator";

const router = express.Router();

router.post("/regional/orchestrate", async (req, res) => {
  try {
    const body = req.body as Partial<RegionalOrchestrationInput>;

    const input: RegionalOrchestrationInput = {
      traceId:    body.traceId,
      patients:   Array.isArray(body.patients)   ? body.patients   : [],
      facilities: Array.isArray(body.facilities) ? body.facilities : [],
    };

    const output = await runRegionalOrchestration(input);
    res.json(output);
  } catch (err) {
    console.error("[Regional] Error:", err);
    res.status(500).json({
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

export default router;
