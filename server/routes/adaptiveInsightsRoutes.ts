import express from "express";
import { buildShiftStaffingForecast } from "../services/shiftStaffingForecast";
import { buildClinicPortfolio } from "../services/clinicPortfolio";
import { saveAdaptiveMemory, getAdaptiveMemory } from "../services/adaptiveMemory";
import { compareScenarios } from "../services/scenarioComparison";
import { buildExecutiveSummary } from "../services/executiveSummary";

const router = express.Router();

router.post("/shift-forecast", (req, res) => {
  res.json(buildShiftStaffingForecast(req.body.rows || []));
});

router.post("/portfolio", (req, res) => {
  res.json(buildClinicPortfolio(req.body.rows || []));
});

router.post("/memory/save", (req, res) => {
  res.json(saveAdaptiveMemory(req.body));
});

router.get("/memory/:clinicId", (req, res) => {
  res.json(getAdaptiveMemory(req.params.clinicId));
});

router.post("/scenario-compare", (req, res) => {
  res.json(compareScenarios(req.body.rows || []));
});

router.post("/executive-summary", (req, res) => {
  res.json(buildExecutiveSummary(req.body));
});

export default router;
