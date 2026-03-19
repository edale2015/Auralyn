import express from "express";
import { digitalTwin } from "../simulation/digitalTwin";
import { whatIfEngine, strategyTester } from "../simulation/whatIfEngine";
import { runControlCycle, getControlLog, multiObjectiveOptimizer, safetyEnvelope } from "../control/adaptiveController";
import { routeCall, handleConversation, endCall, getCallCenterStats } from "../voice/callCenter";
import { patientAcquisitionEngine, growthFlywheel } from "../growth/patientAcquisition";
import { capacityEngine, serviceMixEngine } from "../optimizer/capacityEngine";
import { scalingPlaybookEngine } from "../scaling/scalingPlaybook";
import { enterpriseOrchestrator } from "../meta/enterpriseOrchestrator";

const router = express.Router();

router.get("/digital-twin", (_req, res) => {
  const state = digitalTwin.getState();
  res.json({
    state,
    projectedDailyRevenue: digitalTwin.getProjectedDailyRevenue(),
    projectedMonthlyRevenue: digitalTwin.getProjectedMonthlyRevenue(),
    history: digitalTwin.getHistory().slice(-10)
  });
});

router.post("/digital-twin/update", (req, res) => {
  digitalTwin.update(req.body);
  res.json({
    updated: true,
    state: digitalTwin.getState(),
    projectedDailyRevenue: digitalTwin.getProjectedDailyRevenue()
  });
});

router.post("/simulation/what-if", (req, res) => {
  const { baseState, scenario } = req.body;
  const base = baseState || digitalTwin.getState();
  const result = whatIfEngine.runScenario(base, scenario || {});
  res.json(result);
});

router.post("/simulation/compare", (req, res) => {
  const { baseState, scenarios } = req.body;
  const base = baseState || digitalTwin.getState();
  const results = whatIfEngine.compareScenarios(base, scenarios || []);
  res.json(results);
});

router.post("/simulation/auto-scenarios", (req, res) => {
  const base = req.body.baseState || digitalTwin.getState();
  const results = strategyTester.generateAutoScenarios(base);
  res.json(results);
});

router.post("/control/run-cycle", (req, res) => {
  const state = req.body;
  if (!state.revenuePerHour && state.revenuePerHour !== 0) {
    return res.status(400).json({ error: "revenuePerHour, denialRate, waitTime, capacity required" });
  }
  const result = runControlCycle(state);
  res.json(result);
});

router.get("/control/log", (_req, res) => {
  res.json(getControlLog().slice(-50));
});

router.post("/control/safety-check", (req, res) => {
  const result = safetyEnvelope.validate(req.body);
  res.json(result);
});

router.post("/control/score", (req, res) => {
  const scores = multiObjectiveOptimizer.score(req.body);
  res.json(scores);
});

router.post("/voice/call", (req, res) => {
  const { callId, complaint } = req.body;
  const id = callId || `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const result = routeCall(id, complaint || "general");
  res.json(result);
});

router.post("/voice/conversation", (req, res) => {
  const { callId, text } = req.body;
  if (!callId || !text) {
    return res.status(400).json({ error: "callId and text required" });
  }
  const result = handleConversation(callId, text);
  res.json(result);
});

router.post("/voice/end", (req, res) => {
  const { callId } = req.body;
  const result = endCall(callId);
  res.json(result);
});

router.get("/voice/stats", (_req, res) => {
  res.json(getCallCenterStats());
});

router.post("/growth/allocate", (req, res) => {
  const { budget, channels } = req.body;
  const result = patientAcquisitionEngine.allocateBudget(budget || 5000, channels);
  res.json(result);
});

router.post("/growth/outreach", (req, res) => {
  const { symptom, channelType } = req.body;
  const message = patientAcquisitionEngine.generateOutreachMessage(
    symptom || "common symptoms",
    channelType || "sms"
  );
  res.json({ message });
});

router.post("/growth/projection", (req, res) => {
  const { months } = req.body;
  if (req.body.metrics) {
    growthFlywheel.update(req.body.metrics);
  }
  const projection = growthFlywheel.getGrowthProjection(months || 12);
  res.json({ metrics: growthFlywheel.getMetrics(), projection });
});

router.post("/capacity/balance", (req, res) => {
  const { load, demand } = req.body;
  const result = capacityEngine.balance(load ?? 0.65, demand ?? 0.7);
  res.json(result);
});

router.post("/service-mix/optimize", (req, res) => {
  const { services } = req.body;
  if (!services || !Array.isArray(services)) {
    return res.status(400).json({ error: "services array required" });
  }
  const result = serviceMixEngine.optimize(services);
  res.json(result);
});

router.post("/scaling/project", (req, res) => {
  const { baseState, locations } = req.body;
  const base = baseState || digitalTwin.getState();
  const result = scalingPlaybookEngine.projectExpansion(base, locations);
  res.json(result);
});

router.post("/enterprise/full-analysis", (req, res) => {
  const result = enterpriseOrchestrator.runFullAnalysis(req.body);
  res.json(result);
});

export default router;
