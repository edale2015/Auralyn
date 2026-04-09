/**
 * National Orchestration Routes
 *
 * POST /api/national/orchestrate
 *   Runs the full national orchestrator across all regional states:
 *   federation, cross-region learning, load balancing, policy enforcement,
 *   autonomous scaling, and national population intelligence.
 */

import express                           from "express";
import {
  runNationalOrchestration,
  type NationalOrchestrationInput,
} from "../national/nationalOrchestrator";

const router = express.Router();

router.post("/national/orchestrate", async (req, res) => {
  try {
    const body = req.body as Partial<NationalOrchestrationInput>;

    const input: NationalOrchestrationInput = {
      traceId:       body.traceId,
      regions:       Array.isArray(body.regions) ? body.regions : [],
      policyContext: body.policyContext ?? {},
    };

    const output = await runNationalOrchestration(input);
    res.json(output);
  } catch (err) {
    console.error("[National] Error:", err);
    res.status(500).json({
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

export default router;
