import express from "express";
import { runAdaptiveControlLoop } from "../services/adaptiveControlLoop";
import { buildRoutingReinforcement } from "../services/routingReinforcement";
import { buildCaseMixForecast } from "../services/caseMixForecast";
import { computeClinicProfitability } from "../services/clinicProfitability";
import { simulateThresholdStrategies } from "../services/thresholdSimulation";
import { buildAdaptiveRecommendations } from "../services/adaptiveRecommendations";

const router = express.Router();

router.post("/loop", (req, res) => {
  res.json(runAdaptiveControlLoop(req.body));
});

router.post("/reinforcement", (req, res) => {
  res.json(buildRoutingReinforcement(req.body.rows || []));
});

router.post("/case-mix", (req, res) => {
  res.json(buildCaseMixForecast(req.body.rows || []));
});

router.post("/profitability", (req, res) => {
  res.json(computeClinicProfitability(req.body));
});

router.post("/simulate-thresholds", (req, res) => {
  const { cases = [], strategies = [] } = req.body;
  res.json(simulateThresholdStrategies(cases, strategies));
});

router.post("/recommendations", (req, res) => {
  res.json({
    recommendations: buildAdaptiveRecommendations(req.body)
  });
});

export default router;
