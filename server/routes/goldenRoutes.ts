import { Router } from "express";
import { listActiveGoldenCases, getRunHistory, getCoverageGaps, getCoverageMatrix, getLatestBatchResults } from "../golden/goldenCaseRepository";
import { runGoldenCaseBatch } from "../golden/goldenCaseRunner";
import { generateExpansionTemplates, buildCoverageMatrix } from "../golden/goldenCaseExpansion";
import { publishers } from "../queues/publishers";
import { requireAuth } from "../middleware/requireAuth";
import { logger } from "../utils/logger";

const router = Router();

router.get("/cases", requireAuth, async (req, res) => {
  try {
    const cases = await listActiveGoldenCases();
    res.json({ cases, count: cases.length });
  } catch (e: any) {
    res.status(500).json({ error: "Failed to list golden cases" });
  }
});

router.get("/cases/:id/history", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const limit = Number(req.query.limit ?? 20);
    const history = await getRunHistory(id, limit);
    res.json({ history, count: history.length });
  } catch (e: any) {
    res.status(500).json({ error: "Failed to get run history" });
  }
});

router.get("/runs/:runBatch", requireAuth, async (req, res) => {
  try {
    const { runBatch } = req.params;
    const results = await getLatestBatchResults(decodeURIComponent(runBatch));
    res.json({ results, count: results.length, runBatch });
  } catch (e: any) {
    res.status(500).json({ error: "Failed to get batch results" });
  }
});

router.post("/run", requireAuth, async (req, res) => {
  try {
    const async_ = req.query.async === "true";

    if (async_) {
      const jobId = await publishers.goldenCase.runBatch({});
      logger.info("[GoldenRoutes] Async golden case batch enqueued", { jobId });
      return res.json({ queued: true, jobId });
    }

    logger.info("[GoldenRoutes] Running golden case batch synchronously");
    const result = await runGoldenCaseBatch();
    res.json(result);
  } catch (e: any) {
    logger.warn("[GoldenRoutes] POST /run error", { message: e?.message });
    res.status(500).json({ error: e?.message ?? "Golden case run failed" });
  }
});

router.get("/coverage", requireAuth, async (req, res) => {
  try {
    const matrix = await getCoverageMatrix();
    res.json({ matrix, count: matrix.length });
  } catch (e: any) {
    res.status(500).json({ error: "Failed to get coverage matrix" });
  }
});

router.get("/coverage/gaps", requireAuth, async (req, res) => {
  try {
    const gaps = await getCoverageGaps();
    res.json({ gaps, count: gaps.length });
  } catch (e: any) {
    res.status(500).json({ error: "Failed to get coverage gaps" });
  }
});

router.post("/coverage/rebuild", requireAuth, async (req, res) => {
  try {
    const matrix = await buildCoverageMatrix();
    res.json({ rebuilt: true, cells: matrix.length });
  } catch (e: any) {
    res.status(500).json({ error: "Failed to rebuild coverage matrix" });
  }
});

router.get("/expansion/templates", requireAuth, async (req, res) => {
  try {
    const templates = await generateExpansionTemplates();
    res.json({ templates, count: templates.length });
  } catch (e: any) {
    res.status(500).json({ error: "Failed to generate expansion templates" });
  }
});

export default router;
