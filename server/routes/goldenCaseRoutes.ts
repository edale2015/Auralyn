import express from "express";
import { goldenCaseService } from "../services/goldenCaseService";
import { runAllGoldenCases } from "../services/goldenCaseRunner";

const router = express.Router();

/**
 * GET /api/golden-cases
 * List all registered golden cases.
 */
router.get("/", (_req, res) => {
  res.json(goldenCaseService.list());
});

/**
 * GET /api/golden-cases/runs
 * List all previous golden case run results.
 */
router.get("/runs", (_req, res) => {
  res.json(goldenCaseService.listRuns());
});

/**
 * POST /api/golden-cases/run-all
 * Execute all active golden cases through the clinical workflow and return pass/fail results.
 */
router.post("/run-all", async (_req, res) => {
  try {
    const result = await runAllGoldenCases();
    res.json(result);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Golden case run failed",
    });
  }
});

export default router;
