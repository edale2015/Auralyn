import express from "express";
import { runGraphDrivenSimulation } from "../simulation/graphDrivenSimulationEngine";
import { planSimulationSchedule } from "../simulation/simulationPlanner";
import { selectEngines } from "../brain/adaptiveEngineRouter";
import { getAllEngineCosts, chooseLowestCostEngine, estimatePipelineCost } from "../observability/engineCostOptimizer";
import { expandKnowledgeGraph, getExpansionStats } from "../knowledge/knowledgeExpansionAgent";
import { rankDifferential } from "../engines/differentialRankingEngine";
import { detectPatterns } from "../analysis/multiCasePatternDetector";
import { analyzeConversation } from "../engines/conversationSafetyMonitor";
import { runUnifiedReasoning, getReasoningWeights } from "../reasoning/unifiedClinicalReasoningEngine";
import { recordOutcome, getOutcomeStats } from "../outcomes/outcomeTracker";
import { checkRareDiseases } from "../engines/rareDiseaseSafetyNet";
import { generateClinicalExplanation } from "../explainability/explainableAIEngine";
import { checkGuidelineUpdates, getGuidelineSummary } from "../guidelines/guidelineUpdateAgent";

const router = express.Router();

router.get("/graph-simulations", (req, res) => {
  const max = parseInt(String(req.query.max || "20"));
  res.json(runGraphDrivenSimulation(max));
});

router.get("/simulation-schedule", (_req, res) => {
  res.json(planSimulationSchedule());
});

router.post("/engine-routing", (req, res) => {
  const context = req.body;
  if (!context.complaint) return res.status(400).json({ error: "complaint required" });
  res.json(selectEngines(context));
});

router.get("/engine-costs", (_req, res) => {
  res.json(getAllEngineCosts());
});

router.post("/engine-costs/optimize", (req, res) => {
  const { engines } = req.body;
  if (!Array.isArray(engines)) return res.status(400).json({ error: "engines array required" });
  const best = chooseLowestCostEngine(engines);
  const estimate = estimatePipelineCost(engines);
  res.json({ bestEngine: best, pipelineEstimate: estimate });
});

router.post("/knowledge-expansion", (req, res) => {
  const update = req.body;
  if (!update.type || !update.name) return res.status(400).json({ error: "type and name required" });
  res.json(expandKnowledgeGraph(update));
});

router.get("/knowledge-expansion/stats", (_req, res) => {
  res.json(getExpansionStats());
});

router.post("/differential-ranking", (req, res) => {
  const { candidates } = req.body;
  if (!Array.isArray(candidates)) return res.status(400).json({ error: "candidates array required" });
  res.json(rankDifferential(candidates));
});

router.post("/pattern-detection", (req, res) => {
  const { cases } = req.body;
  if (!Array.isArray(cases)) return res.status(400).json({ error: "cases array required" });
  res.json(detectPatterns(cases));
});

router.post("/conversation-safety", (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: "message required" });
  res.json(analyzeConversation(message));
});

router.post("/unified-reasoning", (req, res) => {
  const { signals } = req.body;
  if (!Array.isArray(signals)) return res.status(400).json({ error: "signals array required" });
  res.json(runUnifiedReasoning(signals));
});

router.get("/reasoning-weights", (_req, res) => {
  res.json(getReasoningWeights());
});

router.post("/outcomes", (req, res) => {
  const { caseId, predictedDiagnosis, actualDiagnosis, predictedDisposition, actualDisposition } = req.body;
  if (!caseId || !predictedDiagnosis || !actualDiagnosis || !predictedDisposition) {
    return res.status(400).json({ error: "caseId, predictedDiagnosis, actualDiagnosis, predictedDisposition required" });
  }
  res.json(recordOutcome(caseId, predictedDiagnosis, actualDiagnosis, predictedDisposition, actualDisposition));
});

router.get("/outcomes/stats", (_req, res) => {
  res.json(getOutcomeStats());
});

router.post("/rare-disease-check", (req, res) => {
  const { symptoms } = req.body;
  if (!Array.isArray(symptoms)) return res.status(400).json({ error: "symptoms array required" });
  res.json(checkRareDiseases(symptoms));
});

router.post("/clinical-explanation", (req, res) => {
  const decision = req.body;
  if (!decision.topDiagnosis || !decision.disposition) {
    return res.status(400).json({ error: "topDiagnosis and disposition required" });
  }
  res.json(generateClinicalExplanation(decision));
});

router.get("/guideline-updates", (_req, res) => {
  res.json(checkGuidelineUpdates());
});

router.get("/guideline-summary", (_req, res) => {
  res.json(getGuidelineSummary());
});

export default router;
