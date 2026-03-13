import express from "express";
import { getGraphMetricsSummary } from "../platform/graphMetricsService";
import { listCompareDiffs } from "../platform/compareDiffStore";
import { listReleaseGateHistory } from "../platform/releaseGateHistoryStore";
import { buildComplaintHardeningQueue } from "../learning/complaintHardeningQueue";

const router = express.Router();

router.get("/api/platform/graph-metrics", async (_req, res) => {
  try {
    const result = await getGraphMetricsSummary();
    res.json({ ok: true, result });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get("/api/platform/compare-diffs", async (req, res) => {
  try {
    const limit = Number(req.query.limit ?? 100);
    const rows = await listCompareDiffs(limit);
    res.json({ ok: true, rows });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get("/api/platform/release-gate-history", async (req, res) => {
  try {
    const complaint = req.query.complaint ? String(req.query.complaint) : undefined;
    const limit = Number(req.query.limit ?? 100);
    const rows = await listReleaseGateHistory(complaint, limit);
    res.json({ ok: true, rows });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get("/api/platform/hardening-queue", async (_req, res) => {
  try {
    const queue = await buildComplaintHardeningQueue();
    res.json({ ok: true, queue });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
