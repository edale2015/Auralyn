/**
 * Autonomous Learning Routes  (/api/ci/*)
 *
 * Self-testing, self-learning, and governance API.
 * Exposes the async simulation engine, learning queue, audit trail,
 * safety modes, knowledge versioning, and drift detection.
 *
 * No clinical logic is ever auto-modified — all changes require explicit
 * human approval through the governance workflow.
 */

import { Router, Request, Response } from "express";
import {
  startSimJob, getSimJob, listSimJobs, cancelSimJob, getSimJobStatus,
} from "../simulation/asyncSimEngine";
import {
  listLearningQueue, getLearningQueueItem, updateSuggestionStatus, getLearningQueueStats, addLearningQueueItem,
} from "../learning/learningQueueStore";
import {
  listAuditLog, getAuditStats, logAuditEvent,
} from "../governance/changeAuditLog";
import {
  getCurrentSafetyMode, setSafetyMode, listSafetyModes,
} from "../governance/safetyModes";
import {
  takeSnapshot, listSnapshots, getSnapshot, diffSnapshots, rollbackToSnapshot,
} from "../governance/knowledgeVersions";
import {
  recordDriftSnapshot, getDriftTimeline, getActiveAlerts, getAllAlerts,
  resolveAlert, getDriftStats, setBaseline,
} from "../learning/driftTracker";

const router = Router();

// ─── SIMULATION ───────────────────────────────────────────────────────────────

router.post("/sim/start", async (req: Request, res: Response) => {
  const { complaint = "all", count = 100, difficulty = "moderate", mode = "generated", label } = req.body;
  const job = startSimJob({ complaint, count: Number(count), difficulty, mode, label });
  res.json({ jobId: job.jobId, status: job.status, totalCases: job.totalCases, params: job.params });
});

router.get("/sim/status/:jobId", (req: Request, res: Response) => {
  const status = getSimJobStatus(req.params.jobId);
  if (!status) return res.status(404).json({ error: "job_not_found" });
  res.json(status);
});

router.get("/sim/results/:jobId", (req: Request, res: Response) => {
  const job = getSimJob(req.params.jobId);
  if (!job) return res.status(404).json({ error: "job_not_found" });
  const includeRaw = req.query.raw === "true";
  res.json({
    jobId:         job.jobId,
    status:        job.status,
    progress:      job.progress,
    params:        job.params,
    summary:       job.summary,
    results:       includeRaw ? job.results : job.results.slice(0, 100),
    totalResults:  job.results.length,
    learningTriggered: job.learningTriggered,
    createdAt:     job.createdAt,
    startedAt:     job.startedAt,
    completedAt:   job.completedAt,
    durationMs:    job.completedAt ? job.completedAt - (job.startedAt ?? job.createdAt) : null,
    error:         job.error,
  });
});

router.delete("/sim/cancel/:jobId", (req: Request, res: Response) => {
  const ok = cancelSimJob(req.params.jobId);
  if (!ok) return res.status(404).json({ error: "job_not_found_or_already_complete" });
  res.json({ ok: true });
});

router.get("/sim/jobs", (_req: Request, res: Response) => {
  const jobs = listSimJobs().map(j => ({
    jobId:         j.jobId,
    status:        j.status,
    params:        j.params,
    progress:      j.progress,
    processedCases: j.processedCases,
    totalCases:    j.totalCases,
    createdAt:     j.createdAt,
    completedAt:   j.completedAt,
    summary: j.summary ? {
      accuracy:             j.summary.accuracy,
      safetyAccuracy:       j.summary.safetyAccuracy,
      falseReassuranceRate: j.summary.falseReassuranceRate,
      er_now_sensitivity:   j.summary.er_now_sensitivity,
      failed:               j.summary.failed,
      totalCases:           j.summary.totalCases,
      failureClusters:      j.summary.failureClusters.slice(0, 5),
    } : null,
    learningTriggered: j.learningTriggered,
  }));
  res.json({ jobs, total: jobs.length });
});

// Record drift snapshot from a completed sim run
router.post("/sim/record-drift/:jobId", (req: Request, res: Response) => {
  const job = getSimJob(req.params.jobId);
  if (!job?.summary || job.status !== "complete") {
    return res.status(400).json({ error: "job_not_complete_or_not_found" });
  }
  const snap = recordDriftSnapshot({
    simRunId:             job.jobId,
    complaint:            job.params.complaint,
    accuracy:             job.summary.accuracy,
    safetyAccuracy:       job.summary.safetyAccuracy,
    falseReassuranceRate: job.summary.falseReassuranceRate,
    er_now_sensitivity:   job.summary.er_now_sensitivity,
    avgConfidence:        job.summary.avgConfidence,
    totalCases:           job.summary.totalCases,
  });
  res.json({ ok: true, snapshot: snap });
});

// ─── LEARNING QUEUE ───────────────────────────────────────────────────────────

router.get("/learning/queue", (req: Request, res: Response) => {
  const { status, type, riskLevel, complaint, limit } = req.query as Record<string, string>;
  res.json(listLearningQueue({
    status:     status    as any,
    type:       type      as any,
    riskLevel:  riskLevel as any,
    complaint,
    limit: limit ? Number(limit) : undefined,
  }));
});

router.get("/learning/queue/stats", (_req: Request, res: Response) => {
  res.json(getLearningQueueStats());
});

router.get("/learning/queue/:id", (req: Request, res: Response) => {
  const item = getLearningQueueItem(req.params.id);
  if (!item) return res.status(404).json({ error: "suggestion_not_found" });
  res.json(item);
});

router.post("/learning/queue/:id/approve", (req: Request, res: Response) => {
  const { reviewedBy = "admin", note } = req.body;
  const updated = updateSuggestionStatus(req.params.id, "approved", reviewedBy, note);
  if (!updated) return res.status(404).json({ error: "suggestion_not_found" });
  res.json({ ok: true, item: updated });
});

router.post("/learning/queue/:id/reject", (req: Request, res: Response) => {
  const { reviewedBy = "admin", note } = req.body;
  const updated = updateSuggestionStatus(req.params.id, "rejected", reviewedBy, note);
  if (!updated) return res.status(404).json({ error: "suggestion_not_found" });
  res.json({ ok: true, item: updated });
});

router.post("/learning/queue/:id/deploy", (req: Request, res: Response) => {
  const item = getLearningQueueItem(req.params.id);
  if (!item) return res.status(404).json({ error: "suggestion_not_found" });
  if (item.status !== "approved") {
    return res.status(400).json({ error: "must_be_approved_first", current: item.status });
  }
  const updated = updateSuggestionStatus(req.params.id, "deployed", req.body.deployedBy, req.body.note);
  res.json({ ok: true, item: updated });
});

// Manual suggestion from physician / admin
router.post("/learning/queue", (req: Request, res: Response) => {
  const { type, title, description, rationale, affectedComplaints, confidence, riskLevel, createdBy } = req.body;
  if (!type || !title) return res.status(400).json({ error: "type and title required" });
  const item = addLearningQueueItem({
    type, title, description: description ?? "", rationale: rationale ?? "",
    affectedComplaints, confidence: confidence ?? 0.7, riskLevel,
  });
  logAuditEvent({
    action: "suggestion_created", source: "physician", actor: createdBy, itemId: item.id, detail: title,
  });
  res.status(201).json(item);
});

// ─── SAFETY MODES ─────────────────────────────────────────────────────────────

router.get("/safety-modes", (_req: Request, res: Response) => {
  res.json({ current: getCurrentSafetyMode(), all: listSafetyModes() });
});

router.post("/safety-modes/set", (req: Request, res: Response) => {
  const { mode, reason } = req.body;
  if (!["observe_only", "assisted_learning", "controlled_auto"].includes(mode)) {
    return res.status(400).json({ error: "invalid_mode", valid: ["observe_only", "assisted_learning", "controlled_auto"] });
  }
  const actor = (req as any).authUser?.displayName ?? (req as any).authUser?.email ?? "admin";
  const state = setSafetyMode(mode, actor, reason);
  res.json({ ok: true, state });
});

// ─── AUDIT TRAIL ──────────────────────────────────────────────────────────────

router.get("/audit/log", (req: Request, res: Response) => {
  const { action, source, itemId, since, limit, offset } = req.query as Record<string, string>;
  res.json(listAuditLog({
    action:  action  as any,
    source:  source  as any,
    itemId,
    since:   since  ? Number(since)  : undefined,
    limit:   limit  ? Number(limit)  : 100,
    offset:  offset ? Number(offset) : 0,
  }));
});

router.get("/audit/stats", (_req: Request, res: Response) => {
  res.json(getAuditStats());
});

// ─── KNOWLEDGE VERSIONING ─────────────────────────────────────────────────────

router.get("/versions", (_req: Request, res: Response) => {
  res.json({ versions: listSnapshots() });
});

router.get("/versions/:versionId", (req: Request, res: Response) => {
  const snap = getSnapshot(req.params.versionId);
  if (!snap) return res.status(404).json({ error: "version_not_found" });
  res.json(snap);
});

router.post("/versions/snapshot", (req: Request, res: Response) => {
  const { label, reason } = req.body;
  if (!label) return res.status(400).json({ error: "label required" });
  const actor = (req as any).authUser?.displayName ?? (req as any).authUser?.email ?? "admin";
  const snap = takeSnapshot(label, actor, reason);
  res.status(201).json(snap);
});

router.get("/versions/diff/:fromId/:toId", (req: Request, res: Response) => {
  const diff = diffSnapshots(req.params.fromId, req.params.toId);
  if (!diff) return res.status(404).json({ error: "one_or_both_versions_not_found" });
  res.json(diff);
});

router.post("/versions/rollback/:versionId", (req: Request, res: Response) => {
  const actor = (req as any).authUser?.displayName ?? (req as any).authUser?.email ?? "admin";
  const result = rollbackToSnapshot(req.params.versionId, actor, req.body.reason);
  res.json(result);
});

// ─── DRIFT DETECTION ──────────────────────────────────────────────────────────

router.get("/drift/stats", (_req: Request, res: Response) => {
  res.json(getDriftStats());
});

router.get("/drift/timeline", (req: Request, res: Response) => {
  const { complaint, limit } = req.query as Record<string, string>;
  res.json({ timeline: getDriftTimeline(complaint, limit ? Number(limit) : 30) });
});

router.get("/drift/alerts", (_req: Request, res: Response) => {
  res.json({ active: getActiveAlerts(), all: getAllAlerts() });
});

router.post("/drift/alerts/:alertId/resolve", (req: Request, res: Response) => {
  const ok = resolveAlert(req.params.alertId);
  if (!ok) return res.status(404).json({ error: "alert_not_found" });
  res.json({ ok: true });
});

router.post("/drift/baseline", (req: Request, res: Response) => {
  const ok = setBaseline(req.body.snapshotId);
  res.json({ ok });
});

// ─── HEALTH OVERVIEW ──────────────────────────────────────────────────────────

router.get("/health", (_req: Request, res: Response) => {
  const lqStats    = getLearningQueueStats();
  const driftStats = getDriftStats();
  const safetyMode = getCurrentSafetyMode();
  const auditStats = getAuditStats();
  const jobs       = listSimJobs();
  const lastJob    = jobs[0];
  const totalAudit = Object.values(auditStats).reduce((s: number, v) => s + (v as number), 0);
  res.json({
    ok: true,
    safetyMode:    safetyMode.mode,
    learningQueue: { pending: lqStats.pending, highRiskPending: lqStats.highRiskPending, total: lqStats.total, deployed: lqStats.deployed },
    drift:         { activeAlerts: driftStats.activeAlerts, criticalAlerts: driftStats.criticalAlerts, trend: driftStats.accuracyTrend, latestAccuracy: driftStats.latestAccuracy },
    simulation:    { totalRuns: jobs.length, lastStatus: lastJob?.status ?? "none", lastAccuracy: lastJob?.summary?.accuracy ?? null },
    auditEntries:  totalAudit,
    versions:      listSnapshots().length,
  });
});

export default router;
