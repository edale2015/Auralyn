import { Router } from "express";
import { getAgentPerformance } from "../learning/outcomeLearningService";
import { getQAHistory, getQAStats } from "../qa/qaLogService";
import { getCognitiveHistory, getCognitiveSubscriberCount } from "../missionControl/cognitiveBus";
import { getCommandGrid, getHighRiskPatients } from "../hospital/commandGrid";
import { getSystemThresholds } from "../learning/metaLearningEngine";

const router = Router();

router.get("/api/mission/snapshot", (_req, res) => {
  res.json({
    agents: getAgentPerformance(),
    qa: getQAHistory(20),
    qaStats: getQAStats(),
    cognitiveHistory: getCognitiveHistory(10),
    commandGrid: getCommandGrid(),
    highRiskPatients: getHighRiskPatients(),
    systemThresholds: getSystemThresholds(),
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

export default router;
