import { Router } from "express";
import { getAgentPerformance } from "../learning/outcomeLearningService";
import { getQAHistory, getQAStats } from "../qa/qaLogService";
import { getCognitiveHistory, getCognitiveSubscriberCount } from "../missionControl/cognitiveBus";
import { getCommandGrid, getHighRiskPatients } from "../hospital/commandGrid";
import { getSystemThresholds } from "../learning/metaLearningEngine";
import { getAgentPerformance as getLiveAgentPerformance, getRecentDriftEvents } from "../assistant/agentPerformanceTracker";
import { getShapHistory, getShapForCase } from "../assistant/shapLogService";
import { getCaseMemory, getAllActiveCases } from "../assistant/caseMemoryService";
import { getEngineReliability, getEngineHealth } from "../assistant/telemedEngineReliability";

const router = Router();

router.get("/api/mission/snapshot", (_req, res) => {
  res.json({
    agents: getAgentPerformance(),
    liveAgentPerformance: getLiveAgentPerformance(),
    driftEvents: getRecentDriftEvents(10),
    qa: getQAHistory(20),
    qaStats: getQAStats(),
    cognitiveHistory: getCognitiveHistory(10),
    commandGrid: getCommandGrid(),
    highRiskPatients: getHighRiskPatients(),
    systemThresholds: getSystemThresholds(),
    shapHistory: getShapHistory(10),
    activeCases: getAllActiveCases(),
    engineReliability: getEngineReliability(),
    engineHealth: getEngineHealth(),
    wsSubscribers: getCognitiveSubscriberCount(),
    ts: Date.now(),
  });
});

router.get("/api/mission/command-grid", (_req, res) => {
  res.json({ grid: getCommandGrid(), highRisk: getHighRiskPatients() });
});

router.get("/api/mission/cognitive-stream", (_req, res) => {
  res.json({ history: getCognitiveHistory(50) });
});

router.get("/api/mission/agent-performance", (_req, res) => {
  res.json(getLiveAgentPerformance());
});

router.get("/api/mission/drift-events", (_req, res) => {
  res.json({ events: getRecentDriftEvents(20) });
});

router.get("/api/mission/shap-history", (_req, res) => {
  res.json({ history: getShapHistory(30) });
});

router.get("/api/mission/case-memory/:caseId", (req, res) => {
  const { caseId } = req.params;
  const memory = getCaseMemory(caseId);
  const shap = getShapForCase(caseId);
  res.json({ caseId, memory, shap });
});

router.get("/api/mission/active-cases", (_req, res) => {
  const cases = getAllActiveCases();
  res.json({ cases });
});

router.get("/api/mission/engine-reliability", (_req, res) => {
  res.json({
    engines: getEngineReliability(),
    health: getEngineHealth(),
    ts: Date.now(),
  });
});

export default router;
