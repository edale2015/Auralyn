import express from "express";
import { requireRole } from "../middleware/requireRole";
import {
  getAgentStatus,
  getCoordinatorStats,
  runAgent,
  runAllAgents,
  disableAgent,
  enableAgent,
} from "../agents/agentCoordinator";
import { runDiagnostic, getAlertLog, getMetricHistory } from "../engines/autoDebugEngine";
import { getOrchestratorMetrics, runFullClinicalFlow, getFlowLog } from "../orchestrator/clinicalOrchestrator";
import { checkDrugInteractions, getHighAlertDrugList } from "../engines/drugInteractionSafetyEngine";
import { checkPregnancySafety, getPregnancyDrugDatabase } from "../engines/pregnancySafetyEngine";
import { checkPediatricSafety, getPediatricAgeGroups } from "../engines/pediatricSafetyEngine";

const router = express.Router();
router.use(requireRole(["admin"]));

router.get("/status", (_req, res) => {
  const agents = getAgentStatus();
  const stats = getCoordinatorStats();
  const diagnostic = runDiagnostic();
  const orchestratorMetrics = getOrchestratorMetrics();

  res.json({
    agents,
    stats,
    system: diagnostic,
    orchestrator: orchestratorMetrics,
    timestamp: new Date().toISOString(),
  });
});

router.get("/agents", (_req, res) => {
  res.json(getAgentStatus());
});

router.post("/run/:name", async (req, res) => {
  try {
    const result = await runAgent(String(req.params.name));
    res.json(result);
  } catch (err: any) {
    res.status(404).json({ error: err.message });
  }
});

router.post("/run-all", async (_req, res) => {
  const results = await runAllAgents();
  res.json(results);
});

router.post("/agents/:name/disable", (req, res) => {
  const ok = disableAgent(String(req.params.name));
  res.json({ success: ok });
});

router.post("/agents/:name/enable", (req, res) => {
  const ok = enableAgent(String(req.params.name));
  res.json({ success: ok });
});

router.get("/diagnostic", (_req, res) => {
  res.json(runDiagnostic());
});

router.get("/alerts", (req, res) => {
  const limit = Number(req.query.limit) || 50;
  res.json(getAlertLog(limit));
});

router.get("/metrics/history", (req, res) => {
  const limit = Number(req.query.limit) || 100;
  res.json(getMetricHistory(limit));
});

router.get("/orchestrator/metrics", (_req, res) => {
  res.json(getOrchestratorMetrics());
});

router.get("/orchestrator/log", (req, res) => {
  const limit = Number(req.query.limit) || 50;
  res.json(getFlowLog(limit));
});

router.post("/orchestrator/run", async (req, res) => {
  const { complaint, answers, patientId, channel } = req.body;
  if (!complaint) return res.status(400).json({ error: "complaint required" });
  const result = await runFullClinicalFlow({ complaint, answers: answers || {}, patientId, channel });
  res.json(result);
});

router.post("/safety/drug-interactions", (req, res) => {
  const { medications, complaint, patientAge } = req.body;
  if (!medications || !Array.isArray(medications)) {
    return res.status(400).json({ error: "medications array required" });
  }
  res.json(checkDrugInteractions({ medications, complaint, patientAge }));
});

router.get("/safety/drug-interactions/high-alert", (_req, res) => {
  res.json({ drugs: getHighAlertDrugList() });
});

router.post("/safety/pregnancy", (req, res) => {
  const { medications, gestationalWeekEstimate, trimester, isBreastfeeding, complaint } = req.body;
  if (!medications || !Array.isArray(medications)) {
    return res.status(400).json({ error: "medications array required" });
  }
  res.json(checkPregnancySafety({ medications, gestationalWeekEstimate, trimester, isBreastfeeding, complaint }));
});

router.get("/safety/pregnancy/database", (_req, res) => {
  res.json(getPregnancyDrugDatabase());
});

router.post("/safety/pediatric", (req, res) => {
  const { medications, ageYears, ageMonths, weightKg, complaint } = req.body;
  if (!medications || !Array.isArray(medications)) {
    return res.status(400).json({ error: "medications array required" });
  }
  if (ageYears === undefined || ageYears === null) {
    return res.status(400).json({ error: "ageYears required" });
  }
  res.json(checkPediatricSafety({ medications, ageYears, ageMonths, weightKg, complaint }));
});

router.get("/safety/pediatric/age-groups", (_req, res) => {
  res.json({ ageGroups: getPediatricAgeGroups() });
});

export default router;
