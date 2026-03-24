import { Router } from "express";
import { computeSystemRisk, getRiskHistory, getSystemRiskStats } from "./predictiveRiskEngine";
import { detectMalpracticeRisk, getMalpracticeLog, getMalpracticeStats } from "./malpracticeDetector";

const router = Router();

router.post("/system", (req, res) => {
  const { caseId, latencyMs = 0, errorRate = 0, overrideRate = 0, riskScore = 0, complaint = "general", redFlags = 0, modelConfidence, protocolDeviation } = req.body;
  if (!caseId) return res.status(400).json({ ok: false, error: "caseId required" });
  const result = computeSystemRisk({ caseId, latencyMs: Number(latencyMs), errorRate: Number(errorRate), overrideRate: Number(overrideRate), riskScore: Number(riskScore), complaint, redFlags: Number(redFlags), modelConfidence, protocolDeviation });
  res.json({ ok: true, ...result });
});

router.post("/malpractice", (req, res) => {
  const { caseId, diagnosis, disposition, protocolDeviation = false } = req.body;
  if (!caseId || !diagnosis || !disposition) return res.status(400).json({ ok: false, error: "caseId, diagnosis, disposition required" });
  const result = detectMalpracticeRisk({ ...req.body, redFlags: req.body.redFlags ?? [] });
  res.json({ ok: true, ...result });
});

router.get("/system/history", (req, res) => {
  const limit = parseInt(String(req.query.limit ?? "50"));
  res.json({ ok: true, history: getRiskHistory(limit), stats: getSystemRiskStats() });
});

router.get("/malpractice/log", (req, res) => {
  const limit = parseInt(String(req.query.limit ?? "50"));
  res.json({ ok: true, log: getMalpracticeLog(limit), stats: getMalpracticeStats() });
});

router.get("/stats", (_req, res) => {
  res.json({ ok: true, systemRisk: getSystemRiskStats(), malpractice: getMalpracticeStats() });
});

export default router;
