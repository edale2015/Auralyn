import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { getQueuesHealth } from "../queues/bullmq/health";
import { listTrackedJobs } from "../queues/bullmq/jobTracker";
import { publishers } from "../queues/publishers";
import { initAllQueues } from "../queues/bullmq/queueFactory";
import { isBullAvailable } from "../queues/bullmq/connection";
import { logger } from "../utils/logger";

const router = Router();

router.get("/health", requireAuth, async (req, res) => {
  try {
    const health = await getQueuesHealth();
    res.json(health);
  } catch (e: any) {
    res.status(500).json({ error: "Failed to get queue health" });
  }
});

router.get("/jobs", requireAuth, async (req, res) => {
  try {
    const queueName = req.query.queue as string | undefined;
    const status = req.query.status as string | undefined;
    const clinicId = req.query.clinicId as string | undefined;
    const limit = Number(req.query.limit ?? 50);

    const jobs = await listTrackedJobs({ queueName, status, clinicId, limit });
    res.json({ jobs, count: jobs.length });
  } catch (e: any) {
    res.status(500).json({ error: "Failed to list jobs" });
  }
});

router.get("/status", requireAuth, (req, res) => {
  res.json({
    bullAvailable: isBullAvailable(),
    timestamp: new Date().toISOString(),
  });
});

router.post("/init", requireAuth, (req, res) => {
  try {
    initAllQueues();
    res.json({ initialized: true });
  } catch (e: any) {
    res.status(500).json({ error: "Failed to initialize queues" });
  }
});

router.post("/publish/golden-batch", requireAuth, async (req, res) => {
  try {
    const jobId = await publishers.goldenCase.runBatch(req.body ?? {});
    res.json({ queued: true, jobId });
  } catch (e: any) {
    res.status(500).json({ error: "Failed to enqueue golden case batch" });
  }
});

router.post("/publish/metrics-rollup", requireAuth, async (req, res) => {
  try {
    const jobId = await publishers.metrics.rollup(req.body ?? {});
    res.json({ queued: true, jobId });
  } catch (e: any) {
    res.status(500).json({ error: "Failed to enqueue metrics rollup" });
  }
});

router.post("/publish/executive-report", requireAuth, async (req, res) => {
  try {
    const jobId = await publishers.report.buildExecutive(req.body ?? {});
    res.json({ queued: true, jobId });
  } catch (e: any) {
    res.status(500).json({ error: "Failed to enqueue executive report" });
  }
});

export default router;
