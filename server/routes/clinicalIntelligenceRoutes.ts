import express from "express";
import { storeClinicalMemory, retrieveSimilarCases, getMemoryStats } from "../memory/clinicalMemoryEngine";
import { applyPatientPersonalization } from "../engines/patientPersonalizationEngine";
import { recordCalibration, getCalibrationStats } from "../training/confidenceCalibrationTrainer";
import { recordAccuracy, detectModelDrift, getAccuracyHistory } from "../analysis/modelDriftDetector";
import { scanMedicalResearch, proposeGraphUpdates, getResearchStats } from "../research/autonomousResearchAgent";

const router = express.Router();

router.post("/memory/store-case", (req, res) => {
  const { caseId, complaint, features, diagnosis, disposition } = req.body;
  if (!caseId || !complaint || !features) {
    return res.status(400).json({ error: "caseId, complaint, and features required" });
  }
  storeClinicalMemory({ caseId, complaint, features, diagnosis, disposition, timestamp: Date.now() });
  res.json({ success: true, caseId });
});

router.post("/memory/retrieve", (req, res) => {
  const { features, limit } = req.body;
  if (!features) return res.status(400).json({ error: "features required" });
  res.json(retrieveSimilarCases(features, limit));
});

router.get("/memory/stats", (_req, res) => {
  res.json(getMemoryStats());
});

router.post("/personalization/apply", (req, res) => {
  res.json(applyPatientPersonalization(req.body));
});

router.post("/calibration/record", (req, res) => {
  const { predicted, correct } = req.body;
  if (predicted == null || correct == null) {
    return res.status(400).json({ error: "predicted and correct required" });
  }
  recordCalibration(predicted, correct);
  res.json({ success: true });
});

router.get("/calibration/curve", (_req, res) => {
  res.json(getCalibrationStats());
});

router.post("/model-drift/record", (req, res) => {
  const { accuracy, source } = req.body;
  if (accuracy == null) return res.status(400).json({ error: "accuracy required" });
  recordAccuracy(accuracy, source);
  res.json({ success: true });
});

router.get("/model-drift", (req, res) => {
  const windowSize = parseInt(String(req.query?.windowSize || "10"));
  res.json(detectModelDrift(windowSize));
});

router.get("/model-drift/history", (_req, res) => {
  res.json(getAccuracyHistory());
});

router.get("/research/findings", async (_req, res) => {
  const findings = await scanMedicalResearch();
  const proposals = proposeGraphUpdates(findings);
  res.json({ findings, proposals });
});

router.get("/research/stats", (_req, res) => {
  res.json(getResearchStats());
});

export default router;
