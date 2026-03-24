import express from "express";
import {
  recordOutcome,
  getProtocolWeight,
  getProtocolAccuracy,
  getAllProtocolStats,
  getRecentOutcomes,
  runLearningCycle,
  applyWeightedScore,
} from "../learning/protocolLearningEngine";
import { logProtocolOutcome, logPhysicianOverride, logDeviceAlert, getOutcomeLog, getOutcomeSummary } from "../learning/outcomeLogger";

const router = express.Router();

router.post("/outcome", (req, res) => {
  const { protocolId, predicted, actual, physicianOverride, overrideTo, patientId, features } = req.body;
  if (!protocolId || !predicted || !actual) {
    return res.status(400).json({ ok: false, error: "protocolId, predicted, actual required" });
  }

  recordOutcome({ protocolId, predicted, actual, physicianOverride, overrideTo, patientId, features });
  logProtocolOutcome({ protocolId, predicted, actual, physicianOverride, overrideTo, patientId });

  const accuracy = getProtocolAccuracy(protocolId);
  const weight = getProtocolWeight(protocolId, predicted);

  return res.json({ ok: true, accuracy, weight, message: "Outcome recorded and weights updated" });
});

router.post("/override", (req, res) => {
  const { protocolId, patientId, originalDecision, overrideTo, reason } = req.body;
  if (!protocolId || !originalDecision || !overrideTo) {
    return res.status(400).json({ ok: false, error: "protocolId, originalDecision, overrideTo required" });
  }

  recordOutcome({ protocolId, predicted: originalDecision, actual: overrideTo, physicianOverride: true, overrideTo, patientId });
  logPhysicianOverride({ protocolId, patientId, originalDecision, overrideTo, reason });

  return res.json({ ok: true, message: "Override recorded", newWeight: getProtocolWeight(protocolId, overrideTo) });
});

router.post("/device-alert", (req, res) => {
  const { device, patientId, alert, value, escalated } = req.body;
  if (!device || !alert) return res.status(400).json({ ok: false, error: "device and alert required" });
  logDeviceAlert({ device, patientId, alert, value, escalated: Boolean(escalated) });
  return res.json({ ok: true, message: "Device alert logged" });
});

router.post("/weighted-score", (req, res) => {
  const { baseScore, protocolId, decision, threshold } = req.body;
  if (baseScore === undefined || !protocolId || !decision) {
    return res.status(400).json({ ok: false, error: "baseScore, protocolId, decision required" });
  }
  const result = applyWeightedScore(Number(baseScore), protocolId, decision, Number(threshold ?? 0.5));
  return res.json({ ok: true, ...result });
});

router.get("/accuracy/:protocolId", (req, res) => {
  res.json({ ok: true, protocolId: req.params.protocolId, ...getProtocolAccuracy(req.params.protocolId) });
});

router.get("/stats", (_req, res) => {
  res.json({ ok: true, protocols: getAllProtocolStats(), outcomes: getOutcomeSummary() });
});

router.get("/outcomes", (req, res) => {
  const limit = Number(req.query.limit ?? 50);
  res.json({ ok: true, outcomes: getRecentOutcomes(limit) });
});

router.get("/log", (req, res) => {
  const limit = Number(req.query.limit ?? 100);
  res.json({ ok: true, log: getOutcomeLog(limit) });
});

router.post("/cycle", (_req, res) => {
  const result = runLearningCycle();
  res.json({ ok: true, ...result });
});

export default router;
