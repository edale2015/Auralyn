/**
 * Global Orchestration Routes
 *
 * POST /api/global/orchestrate
 *   Runs the full global orchestrator: continent grouping, pandemic detection,
 *   SIR spread simulation, early warning system, and global policy enforcement.
 */

import express                          from "express";
import {
  runGlobalOrchestration,
  type GlobalOrchestrationInput,
} from "../global/globalOrchestrator";

const router = express.Router();

router.post("/global/orchestrate", async (req, res) => {
  try {
    const body = req.body as Partial<GlobalOrchestrationInput>;

    const input: GlobalOrchestrationInput = {
      traceId:  body.traceId,
      regions:  Array.isArray(body.regions) ? body.regions : [],
      simInput: body.simInput,
    };

    const output = runGlobalOrchestration(input);
    res.json(output);
  } catch (err) {
    console.error("[Global] Error:", err);
    res.status(500).json({
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

export default router;
