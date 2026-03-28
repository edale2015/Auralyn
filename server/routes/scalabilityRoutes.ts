import { Router, Request, Response } from "express";
import { enqueueExplanation, getJobStatus, getAsyncLLMStats } from "../llm/asyncLLM";
import { queueAudit, getAuditQueueStats } from "../ops/auditQueue";
import { queueLearning, getRLHFQueueStats } from "../learning/rlhfQueue";
import { getRegionConfig, listRegions, getRegionSummary } from "../infra/regionRouter";
import { getRateLimiterStats } from "../infra/rateLimiter";
import { getCache, setCache, getCacheStats } from "../infra/cache";
import { withTimeout, getPerformanceStats } from "../infra/performanceGuard";

const router = Router();

// ── Async LLM ─────────────────────────────────────────────────────────────────
router.post("/llm/enqueue", (req: Request, res: Response) => {
  res.json(enqueueExplanation(req.body));
});

router.get("/llm/job/:jobId", (req: Request, res: Response) => {
  const job = getJobStatus(req.params.jobId);
  if (!job) return res.status(404).json({ error: "Job not found" });
  res.json(job);
});

router.get("/llm/stats", (_req: Request, res: Response) => {
  res.json(getAsyncLLMStats());
});

router.get("/llm/demo", async (_req: Request, res: Response) => {
  const enqueued = enqueueExplanation({ diagnosis: "streptococcal_pharyngitis", symptoms: ["sore_throat", "fever", "exudate"] });
  await new Promise((r) => setTimeout(r, 250));
  const job = getJobStatus(enqueued.jobId);
  res.json({ enqueued, job });
});

// ── Async Audit Queue ─────────────────────────────────────────────────────────
router.post("/audit/queue", (req: Request, res: Response) => {
  res.json(queueAudit(req.body, { secure: req.body._secure }));
});

router.get("/audit/queue/stats", (_req: Request, res: Response) => {
  res.json(getAuditQueueStats());
});

// ── RLHF Queue ────────────────────────────────────────────────────────────────
router.post("/rlhf/queue", (req: Request, res: Response) => {
  const { ai, physician, outcome, disposition } = req.body;
  if (!ai || !physician || !outcome || !disposition) {
    return res.status(400).json({ error: "ai, physician, outcome, disposition required" });
  }
  res.json(queueLearning(req.body));
});

router.get("/rlhf/queue/stats", (_req: Request, res: Response) => {
  res.json(getRLHFQueueStats());
});

router.get("/rlhf/queue/demo", async (_req: Request, res: Response) => {
  const job = queueLearning({
    ai: "viral_uri",
    physician: "streptococcal_pharyngitis",
    outcome: "confirmed_wrong",
    disposition: "SELF_CARE",
    diagnosisKey: "strep_pharyngitis",
  });
  await new Promise((r) => setTimeout(r, 200));
  res.json({ queued: job, stats: getRLHFQueueStats() });
});

// ── Region Router ─────────────────────────────────────────────────────────────
router.get("/region/config/:country", (req: Request, res: Response) => {
  res.json(getRegionConfig(req.params.country));
});

router.get("/region/list", (_req: Request, res: Response) => {
  res.json(listRegions());
});

router.get("/region/summary", (_req: Request, res: Response) => {
  res.json(getRegionSummary());
});

// ── Rate Limiter Stats ────────────────────────────────────────────────────────
router.get("/rate-limiter/stats", (_req: Request, res: Response) => {
  res.json(getRateLimiterStats());
});

// ── Cache Layer ───────────────────────────────────────────────────────────────
router.get("/cache/stats", (_req: Request, res: Response) => {
  res.json(getCacheStats());
});

router.post("/cache/set", (req: Request, res: Response) => {
  const { key, value, ttlMs } = req.body;
  if (!key) return res.status(400).json({ error: "key required" });
  setCache(key, value, ttlMs);
  res.json({ ok: true, key });
});

router.get("/cache/get/:key", (req: Request, res: Response) => {
  const value = getCache(req.params.key);
  if (value === null) return res.status(404).json({ error: "Cache miss" });
  res.json({ key: req.params.key, value });
});

router.get("/cache/demo", (_req: Request, res: Response) => {
  setCache("demo:triage:ENC-001", { disposition: "URGENT_24H", confidence: 0.91 }, 30_000);
  const hit = getCache("demo:triage:ENC-001");
  res.json({ stored: true, retrieved: hit, stats: getCacheStats() });
});

// ── Performance Guard ─────────────────────────────────────────────────────────
router.get("/performance/stats", (_req: Request, res: Response) => {
  res.json(getPerformanceStats());
});

router.get("/performance/demo", async (_req: Request, res: Response) => {
  const result = await withTimeout(
    new Promise<string>((resolve) => setTimeout(() => resolve("clinical_triage_complete"), 80)),
    2000,
    "timeout_fallback",
  );
  res.json({ result, stats: getPerformanceStats() });
});

// ── Unified Scalability Status ────────────────────────────────────────────────
router.get("/status", async (_req: Request, res: Response) => {
  res.json({
    asyncLLM:       getAsyncLLMStats(),
    auditQueue:     getAuditQueueStats(),
    rlhfQueue:      getRLHFQueueStats(),
    regionRouter:   getRegionSummary(),
    rateLimiter:    getRateLimiterStats(),
    cache:          getCacheStats(),
    performance:    getPerformanceStats(),
  });
});

export default router;
