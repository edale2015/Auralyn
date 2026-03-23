import express from "express";
import { getCases, getCaseById, reviewCase, getDashboardStats } from "../physician/physicianController";
import { getAuditLog, getAuditStats, logDecisionTrace } from "../physician/auditEngine";
import { overlayGuidance } from "../robotics/visionOverlay";

const router = express.Router();

router.get("/cases", (req, res) => {
  const { status } = req.query;
  const cases = getCases(status as any);
  res.json({ cases });
});

router.get("/cases/:id", (req, res) => {
  const c = getCaseById(req.params.id);
  if (!c) return res.status(404).json({ error: "Case not found" });
  res.json({ case: c });
});

router.post("/cases/:id/review", (req, res) => {
  const { decision, reviewedBy, notes } = req.body;
  const result = reviewCase(req.params.id, decision, reviewedBy ?? "physician", notes);
  if (!result) return res.status(404).json({ error: "Case not found" });
  res.json({ ok: true, case: result });
});

router.get("/dashboard", (_req, res) => {
  const stats = getDashboardStats();
  res.json({ ok: true, stats });
});

router.get("/audit", (req, res) => {
  const { actor, entityType, limit } = req.query;
  const log = getAuditLog({
    actor: actor as any,
    entityType: entityType as any,
    limit: limit ? parseInt(limit as string) : 50,
  });
  res.json({ log });
});

router.get("/audit/stats", (_req, res) => {
  res.json({ stats: getAuditStats() });
});

router.post("/audit/log", (req, res) => {
  const entry = logDecisionTrace(req.body);
  res.json({ ok: true, entry });
});

router.post("/vision-overlay", (req, res) => {
  const { tool, currentPose, confidence } = req.body;
  const guidance = overlayGuidance({ tool: tool ?? "otoscope", currentPose, confidence });
  res.json({ ok: true, guidance });
});

export default router;
