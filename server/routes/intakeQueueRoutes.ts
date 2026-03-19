import { Router } from "express";
import { z } from "zod";
import { requireRole } from "../middleware/requireRole";
import {
  enqueue,
  enqueueBatch,
  getJobStatus,
  getQueueStats,
  getRecentJobs,
  updateQueueConfig,
  pauseQueue,
  resumeQueue,
  drainQueue,
} from "../queue/intakeQueue";

const router = Router();

const intakeSchema = z.object({
  text: z.string().min(1),
  patientId: z.string().optional(),
  channel: z.enum(["web", "telegram", "whatsapp"]).optional().default("web"),
  answers: z.record(z.string()).optional(),
  metadata: z.record(z.any()).optional(),
  priority: z.number().min(0).max(10).optional().default(0),
});

router.post("/", requireRole(["admin", "physician"]), (req, res) => {
  const parsed = intakeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const { priority, ...data } = parsed.data;
  const result = enqueue(data, { priority });

  if ("error" in result) {
    return res.status(503).json({ status: "rejected", error: result.error });
  }

  res.json({ status: "queued", jobId: result.jobId, position: result.position });
});

const batchIntakeSchema = z.object({
  cases: z.array(z.object({
    text: z.string().min(1),
    patientId: z.string().optional(),
    channel: z.enum(["web", "telegram", "whatsapp"]).optional().default("web"),
    priority: z.number().min(0).max(10).optional().default(0),
  })).min(1).max(200),
});

router.post("/batch", requireRole(["admin"]), (req, res) => {
  const parsed = batchIntakeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const jobs = enqueueBatch(
    parsed.data.cases.map((c) => ({
      data: { text: c.text, patientId: c.patientId, channel: c.channel },
      priority: c.priority,
    })),
  );

  const queued = jobs.filter((j) => "jobId" in j).length;
  const rejected = jobs.filter((j) => "error" in j).length;

  res.json({ queued, rejected, jobs });
});

router.get("/job/:jobId", requireRole(["admin", "physician"]), (req, res) => {
  const job = getJobStatus(req.params.jobId);
  if (!job) return res.status(404).json({ error: "Job not found" });

  const response: any = {
    id: job.id,
    status: job.status,
    patientId: job.data.patientId,
    queuedAt: job.queuedAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    retries: job.retries,
  };

  if (job.status === "completed" && job.result) {
    response.result = {
      decision: job.result.decision,
      executionOrder: job.result.executionOrder,
      durationMs: job.result.durationMs,
    };
  }
  if (job.status === "failed") {
    response.error = job.error;
  }

  res.json(response);
});

router.get("/stats", requireRole(["admin", "physician"]), (_req, res) => {
  res.json(getQueueStats());
});

router.get("/jobs", requireRole(["admin"]), (req, res) => {
  const limit = Number(req.query.limit ?? 50);
  res.json(getRecentJobs(limit));
});

const configSchema = z.object({
  concurrency: z.number().min(1).max(200).optional(),
  maxRetries: z.number().min(0).max(5).optional(),
  maxQueueSize: z.number().min(100).max(100000).optional(),
});

router.patch("/config", requireRole(["admin"]), (req, res) => {
  const parsed = configSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const updated = updateQueueConfig(parsed.data);
  res.json({ updated: true, config: updated });
});

router.post("/pause", requireRole(["admin"]), (_req, res) => {
  pauseQueue();
  res.json({ paused: true });
});

router.post("/resume", requireRole(["admin"]), (_req, res) => {
  resumeQueue();
  res.json({ resumed: true });
});

router.post("/drain", requireRole(["admin"]), (_req, res) => {
  const count = drainQueue();
  res.json({ drained: count });
});

export default router;
