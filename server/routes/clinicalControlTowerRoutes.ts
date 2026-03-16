import express from "express";
import { runSystemReview } from "../brain/systemReviewEngine";
import { getAllEngines, getEngineCounts } from "../brain/engineRegistry";
import { listSimulationRuns, getLastRunSummary } from "../simulation/simulationStore";
import { getAllChannelPerformance } from "../simulation/channelSimulationHarness";
import { complaintCoverageMatrix, getOverallCoverageStats } from "../analysis/complaintCoverageMatrix";
import { getImprovements } from "../improvement/improvementStore";
import { getLearningStats } from "../simulation/simulationLearningBridge";

const router = express.Router();

router.get("/cct/health", (_req, res) => {
  const review = runSystemReview();
  const engineCounts = getEngineCounts();
  const lastSimSummary = getLastRunSummary();
  const coverageStats = getOverallCoverageStats();

  res.json({
    systemHealth: {
      score: review.healthScore,
      activeEngines: review.activeEngines,
      totalEngines: review.totalEngines,
      enginesByLevel: engineCounts,
    },
    simulation: lastSimSummary
      ? {
          dispositionAccuracy: lastSimSummary.dispositionAccuracy,
          diagnosisAccuracy: lastSimSummary.diagnosisAccuracy,
          avgScore: lastSimSummary.avgScore,
          redFlagMissRate: lastSimSummary.redFlagMissRate,
          totalCases: lastSimSummary.totalCases,
        }
      : null,
    coverage: coverageStats,
    topSuggestions: review.suggestions.slice(0, 5),
    timestamp: Date.now(),
  });
});

router.get("/cct/engines", (_req, res) => {
  const engines = getAllEngines();
  const counts = getEngineCounts();
  const active = engines.filter(e => e.status === "active").length;

  res.json({
    total: engines.length,
    active,
    counts,
    engines: engines.map(e => ({
      name: e.name,
      level: e.level,
      status: e.status,
      avgLatencyMs: e.avgLatencyMs,
    })),
  });
});

router.get("/cct/simulation-summary", (_req, res) => {
  const runs = listSimulationRuns();
  const lastSummary = getLastRunSummary();
  const learningStats = getLearningStats();

  res.json({
    totalRuns: runs.length,
    lastSummary,
    learningUpdates: learningStats,
    recentRuns: runs.slice(0, 5),
  });
});

router.get("/cct/failures", (_req, res) => {
  const runs = listSimulationRuns();

  const allFailures: Record<string, number> = {};
  runs.forEach(r => {
    if ((r as any).failureBreakdown) {
      Object.entries((r as any).failureBreakdown).forEach(([cat, cnt]) => {
        allFailures[cat] = (allFailures[cat] ?? 0) + (cnt as number);
      });
    }
  });

  const sorted = Object.entries(allFailures)
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);

  res.json({ failures: sorted, totalRuns: runs.length });
});

router.get("/cct/channels", (_req, res) => {
  res.json(getAllChannelPerformance());
});

router.get("/cct/coverage", (_req, res) => {
  res.json({
    stats: getOverallCoverageStats(),
    matrix: complaintCoverageMatrix,
  });
});

router.get("/cct/improvements", (_req, res) => {
  const improvements = getImprovements();
  const latest = improvements[0] ?? null;

  res.json({
    total: improvements.length,
    latest,
    allImprovements: improvements.slice(0, 20),
  });
});

router.get("/cct/summary", (_req, res) => {
  const review = runSystemReview();
  const lastSim = getLastRunSummary();
  const coverageStats = getOverallCoverageStats();
  const learningStats = getLearningStats();
  const channels = getAllChannelPerformance();
  const improvements = getImprovements();

  res.json({
    health: {
      score: review.healthScore,
      activeEngines: review.activeEngines,
      totalEngines: review.totalEngines,
    },
    simulation: lastSim,
    coverage: coverageStats,
    learning: learningStats,
    channels: channels.map(c => ({
      channel: c.channel,
      dropoutRate: c.dropoutRate,
      avgCompletionTime: c.avgCompletionTime,
    })),
    pendingImprovements: improvements.slice(0, 3).flatMap(r => r.improvements),
    topSuggestion: review.suggestions[0] ?? null,
    timestamp: Date.now(),
  });
});

export default router;
