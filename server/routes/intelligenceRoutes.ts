import express from "express";
import { rankPhysicians, getSeededRankings } from "../services/physicianRanking";
import { getSeededRouting, getSeededPhysicians, intelligentlyRouteCase, IntelligentRouteInput } from "../services/intelligentRouter";
import { buildComplaintCalibration, calibrateConfidence, getSeededCalibration } from "../services/confidenceCalibration";
import { detectMetricAnomaly, getSeededAnomalies } from "../services/anomalyDetector";
import { computeCostPerCase, recommendCostAction, getSeededCostAnalysis } from "../services/costOptimizer";
import { buildIntelligenceRecommendations } from "../services/intelligenceRecommendations";
import { determineSafetyMode } from "../services/safetyMode";
import { tuneApprovalThreshold } from "../services/selfTuningThresholds";
import { buildPhysicianCoaching } from "../services/physicianCoaching";
import { buildComplaintHardeningPlan, getSeededHardeningPlan } from "../services/complaintHardening";

const router = express.Router();

router.get("/dashboard", (req, res) => {
  const rankings = getSeededRankings();
  const anomalies = getSeededAnomalies();
  const costAnalysis = getSeededCostAnalysis();
  const calibration = getSeededCalibration();
  const hardening = getSeededHardeningPlan();

  const overrideAnomaly = anomalies.find((a) => a.metric === "override_rate");
  const hasCritical = anomalies.some((a) => a.severity === "critical");
  const hasWatch = anomalies.some((a) => a.severity === "watch");

  const safetyMode = determineSafetyMode({
    driftDetected: hasCritical,
    anomalySeverity: hasCritical ? "critical" : hasWatch ? "watch" : "normal",
    overrideRate: overrideAnomaly?.latest || 0,
  });

  const recommendations = buildIntelligenceRecommendations({
    driftDetected: hasCritical,
    overrideRate: overrideAnomaly?.latest || 0,
    escalationRate: anomalies.find((a) => a.metric === "escalation_rate")?.latest || 0,
    avgCostPerCase: costAnalysis.averageCostPerCase,
    anomalySeverity: hasCritical ? "critical" : hasWatch ? "watch" : "normal",
  });

  const threshold = tuneApprovalThreshold({
    currentConfidenceThreshold: 0.85,
    recentOverrideRate: overrideAnomaly?.latest || 0,
    recentAccuracy: anomalies.find((a) => a.metric === "accuracy")?.latest || 0.85,
  });

  const coaching = rankings.map((r) =>
    buildPhysicianCoaching({
      physicianId: r.physicianId,
      avgReviewTimeSeconds: r.avgReviewTimeSeconds,
      overrideRate: r.overrideRate,
      avgSatisfaction: r.avgSatisfaction,
      highRiskHandled: r.highRiskHandled,
    })
  );

  res.json({
    rankings,
    anomalies,
    costAnalysis,
    calibration,
    hardening,
    safetyMode,
    recommendations,
    threshold,
    coaching,
  });
});

router.post("/rank-physicians", (req, res) => {
  const ranked = rankPhysicians(req.body.physicians || []);
  res.json(ranked);
});

router.post("/route-case", (req, res) => {
  const input: IntelligentRouteInput = req.body;
  const result = getSeededRouting(input);
  res.json(result);
});

router.post("/calibration/build", (req, res) => {
  res.json(buildComplaintCalibration(req.body.rows || []));
});

router.post("/calibration/apply", (req, res) => {
  const { complaint, rawConfidence, calibrations } = req.body;
  res.json(calibrateConfidence(complaint, rawConfidence, calibrations || []));
});

router.get("/calibration", (req, res) => {
  res.json(getSeededCalibration());
});

router.post("/anomaly", (req, res) => {
  res.json(detectMetricAnomaly(req.body.metric, req.body.points || []));
});

router.get("/anomalies", (req, res) => {
  res.json(getSeededAnomalies());
});

router.post("/cost", (req, res) => {
  const result = computeCostPerCase(req.body.rows || []);
  res.json({ ...result, recommendation: recommendCostAction(result.averageCostPerCase) });
});

router.get("/cost", (req, res) => {
  res.json(getSeededCostAnalysis());
});

router.post("/recommendations", (req, res) => {
  res.json({ recommendations: buildIntelligenceRecommendations(req.body) });
});

router.post("/safety-mode", (req, res) => {
  res.json(determineSafetyMode(req.body));
});

router.post("/tune-threshold", (req, res) => {
  res.json(tuneApprovalThreshold(req.body));
});

router.post("/coach-physician", (req, res) => {
  res.json(buildPhysicianCoaching(req.body));
});

router.post("/harden-complaints", (req, res) => {
  res.json(buildComplaintHardeningPlan(req.body.rows || []));
});

router.get("/hardening", (req, res) => {
  res.json(getSeededHardeningPlan());
});

export default router;
