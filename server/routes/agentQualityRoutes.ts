/**
 * agentQualityRoutes.ts — Agentic Engineering quality gates
 * Mounted at /api/quality
 *
 * Cognitive Debt Tracker:
 *   POST /api/quality/debt/sessions                   — create session
 *   POST /api/quality/debt/sessions/:id/decisions     — record a decision
 *   PATCH /api/quality/debt/sessions/:id/decisions/:did/reviewed — mark reviewed
 *   GET  /api/quality/debt/sessions/:id/report        — full debt report
 *   GET  /api/quality/debt/sessions                   — list all sessions
 *   DELETE /api/quality/debt/sessions/:id             — clear session
 *
 * Agent Task Spec (Spec First):
 *   POST /api/quality/specs                           — create spec
 *   GET  /api/quality/specs                           — list specs
 *   GET  /api/quality/specs/:id                       — get spec
 *   PATCH /api/quality/specs/:id/approve              — approve spec
 *   PATCH /api/quality/specs/:id/reject               — reject spec
 *   POST /api/quality/specs/classify                  — classify prompt style
 *   POST /api/quality/specs/validate                  — validate without saving
 *
 * Agent Output Gate (PR-Rigor Review):
 *   POST /api/quality/reviews                         — submit output for review
 *   GET  /api/quality/reviews                         — queue (all or by status)
 *   GET  /api/quality/reviews/stats                   — queue statistics
 *   GET  /api/quality/reviews/pending                 — pending reviews
 *   GET  /api/quality/reviews/escalated               — escalated (immediate action)
 *   GET  /api/quality/reviews/:id                     — get single review
 *   PATCH /api/quality/reviews/:id/conduct            — conduct human review
 *   PATCH /api/quality/reviews/:id/approve            — quick approve
 *   PATCH /api/quality/reviews/:id/reject             — quick reject
 */

import express from "express";

import {
  createSession, recordDecision, markDecisionReviewed,
  getSessionReport, listSessions, clearSession,
  getSessionDecisions, getSessionContradictions, computeDebtScore,
} from "../quality/cognitiveDebtTracker";

import {
  createSpec, getSpec, listSpecs, approveSpec, rejectSpec,
  archiveSpec, validateSpec, classifyPromptStyle, requiresSpecApproval, hasApprovedSpec,
} from "../quality/agentTaskSpec";

import {
  submitForReview, conductReview, getReview, getReviewQueue,
  getPendingReviews, getEscalatedReviews, getQueueStats,
  approveOutput, rejectOutput, type AgentOutput,
} from "../quality/agentOutputGate";

const router = express.Router();

// ──────────────────────────────────────────────────────────────────────────────
// COGNITIVE DEBT TRACKER
// ──────────────────────────────────────────────────────────────────────────────

router.post("/debt/sessions", (req, res) => {
  const { sessionId, agentRole, initialContext } = req.body as {
    sessionId?: string; agentRole?: string; initialContext?: string;
  };
  if (!sessionId || !agentRole) {
    return void res.status(400).json({ error: "sessionId and agentRole are required" });
  }
  createSession(sessionId, agentRole, initialContext ?? "");
  const report = getSessionReport(sessionId);
  res.status(201).json(report);
});

router.post("/debt/sessions/:id/decisions", (req, res) => {
  const { agentRole, decision, contextSnapshot } = req.body as {
    agentRole?: string; decision?: string; contextSnapshot?: string;
  };
  if (!agentRole || !decision) {
    return void res.status(400).json({ error: "agentRole and decision are required" });
  }
  const entry = recordDecision(req.params.id, agentRole, decision, contextSnapshot ?? "");
  const report = getSessionReport(req.params.id);
  res.status(201).json({ decision: entry, debtScore: report?.debtScore, collapseRisk: report?.collapseRisk });
});

router.patch("/debt/sessions/:id/decisions/:did/reviewed", (req, res) => {
  const ok = markDecisionReviewed(req.params.id, req.params.did);
  if (!ok) return void res.status(404).json({ error: "Session or decision not found" });
  res.json({ ok: true, decisionId: req.params.did });
});

router.get("/debt/sessions", (_req, res) => {
  res.json({ sessions: listSessions() });
});

router.get("/debt/sessions/:id/report", (req, res) => {
  const report = getSessionReport(req.params.id);
  if (!report) return void res.status(404).json({ error: "Session not found" });
  res.json(report);
});

router.get("/debt/sessions/:id/decisions", (req, res) => {
  res.json({ decisions: getSessionDecisions(req.params.id) });
});

router.get("/debt/sessions/:id/contradictions", (req, res) => {
  res.json({ contradictions: getSessionContradictions(req.params.id) });
});

router.delete("/debt/sessions/:id", (req, res) => {
  const ok = clearSession(req.params.id);
  if (!ok) return void res.status(404).json({ error: "Session not found" });
  res.json({ ok: true, sessionId: req.params.id });
});

// ──────────────────────────────────────────────────────────────────────────────
// AGENT TASK SPEC (Spec First)
// ──────────────────────────────────────────────────────────────────────────────

router.post("/specs/validate", (req, res) => {
  const result = validateSpec(req.body);
  res.json(result);
});

router.post("/specs/classify", (req, res) => {
  const { text } = req.body as { text?: string };
  if (!text) return void res.status(400).json({ error: "text is required" });
  const style = classifyPromptStyle(text);
  res.json({ text, promptStyle: style });
});

router.post("/specs", (req, res) => {
  const spec = createSpec(req.body);
  res.status(201).json(spec);
});

router.get("/specs", (req, res) => {
  const status = req.query.status as string | undefined;
  res.json({ specs: listSpecs(status as Parameters<typeof listSpecs>[0]) });
});

router.get("/specs/:id", (req, res) => {
  const spec = getSpec(req.params.id);
  if (!spec) return void res.status(404).json({ error: "Spec not found" });
  res.json(spec);
});

router.patch("/specs/:id/approve", (req, res) => {
  const { approvedBy } = req.body as { approvedBy?: string };
  if (!approvedBy) return void res.status(400).json({ error: "approvedBy is required" });
  const spec = approveSpec(req.params.id, approvedBy);
  if (!spec) return void res.status(404).json({ error: "Spec not found" });
  res.json(spec);
});

router.patch("/specs/:id/reject", (req, res) => {
  const { reason } = req.body as { reason?: string };
  if (!reason) return void res.status(400).json({ error: "reason is required" });
  const spec = rejectSpec(req.params.id, reason);
  if (!spec) return void res.status(404).json({ error: "Spec not found" });
  res.json(spec);
});

router.patch("/specs/:id/archive", (req, res) => {
  const ok = archiveSpec(req.params.id);
  if (!ok) return void res.status(404).json({ error: "Spec not found" });
  res.json({ ok: true, id: req.params.id });
});

router.get("/specs/check/required", (req, res) => {
  const { agentRole, taskName } = req.query as { agentRole?: string; taskName?: string };
  if (!agentRole || !taskName) {
    return void res.status(400).json({ error: "agentRole and taskName are required" });
  }
  const required = requiresSpecApproval(agentRole, taskName);
  const approved = hasApprovedSpec(agentRole, taskName);
  res.json({ agentRole, taskName, required, approved, canProceed: !required || approved });
});

// ──────────────────────────────────────────────────────────────────────────────
// AGENT OUTPUT GATE (PR-Rigor Review)
// ──────────────────────────────────────────────────────────────────────────────

router.post("/reviews", (req, res) => {
  const output = req.body as AgentOutput;
  if (!output.agentRole || !output.output) {
    return void res.status(400).json({ error: "agentRole and output are required" });
  }
  if (!output.id) output.id = `out_${Date.now()}`;
  if (!output.context) output.context = "";
  const review = submitForReview(output);
  res.status(201).json(review);
});

router.get("/reviews/stats", (_req, res) => {
  res.json(getQueueStats());
});

router.get("/reviews/pending", (_req, res) => {
  res.json({ reviews: getPendingReviews() });
});

router.get("/reviews/escalated", (_req, res) => {
  res.json({ reviews: getEscalatedReviews() });
});

router.get("/reviews", (req, res) => {
  const status = req.query.status as string | undefined;
  const queue  = getReviewQueue(status as Parameters<typeof getReviewQueue>[0]);
  res.json({ reviews: queue, total: queue.length });
});

router.get("/reviews/:id", (req, res) => {
  const review = getReview(req.params.id);
  if (!review) return void res.status(404).json({ error: "Review not found" });
  res.json(review);
});

router.patch("/reviews/:id/conduct", (req, res) => {
  const { reviewedBy, checklist, notes } = req.body as {
    reviewedBy?: string; checklist?: Record<string, boolean | null>; notes?: string;
  };
  if (!reviewedBy) return void res.status(400).json({ error: "reviewedBy is required" });
  const review = conductReview(req.params.id, reviewedBy, checklist ?? {}, notes);
  if (!review) return void res.status(404).json({ error: "Review not found" });
  res.json(review);
});

router.patch("/reviews/:id/approve", (req, res) => {
  const { approvedBy, notes } = req.body as { approvedBy?: string; notes?: string };
  if (!approvedBy) return void res.status(400).json({ error: "approvedBy is required" });
  const review = approveOutput(req.params.id, approvedBy, notes);
  if (!review) return void res.status(404).json({ error: "Review not found" });
  res.json(review);
});

router.patch("/reviews/:id/reject", (req, res) => {
  const { rejectedBy, reason } = req.body as { rejectedBy?: string; reason?: string };
  if (!rejectedBy || !reason) {
    return void res.status(400).json({ error: "rejectedBy and reason are required" });
  }
  const review = rejectOutput(req.params.id, rejectedBy, reason);
  if (!review) return void res.status(404).json({ error: "Review not found" });
  res.json(review);
});

export default router;
