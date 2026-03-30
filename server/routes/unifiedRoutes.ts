/**
 * Unified Pipeline Route
 *
 * POST /api/run — entry point that runs the full 9-stage autonomous pipeline
 * and returns the enriched result with metadata.
 */

import { Router }                  from "express";
import { runAutonomousPipeline }   from "../system/runAutonomousPipeline";

const router = Router();

router.post("/run", async (req, res) => {
  try {
    const result = await runAutonomousPipeline(req.body);
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err.message ?? "Pipeline failed" });
  }
});

export default router;
