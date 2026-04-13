/**
 * evalRoutes.ts — Skill evaluation API
 * Mounted at /api/evals
 *
 *   POST /api/evals/run              — run eval suite (parallel A/B)
 *   POST /api/evals/regression       — regression check (95% threshold)
 *   POST /api/evals/benchmark        — benchmark with version tracking
 *   GET  /api/evals/benchmark/:skill — get benchmark history + comparison
 *   POST /api/evals/trigger-optimize — optimize skill trigger description
 *   POST /api/evals/compare          — blind comparator (A vs B)
 *   GET  /api/evals/alerts           — get regression alerts
 *   GET  /api/evals/alerts/:skill    — get alerts for specific skill
 */

import express from "express";
import { runEvalSuite, registerEvalCases, getEvalCases, type EvalCase } from "../evals/evalEngine";
import { runRegressionCheck, getAlerts } from "../evals/regressionMonitor";
import { runBenchmark, getBenchmarkHistory, compareBenchmarks } from "../evals/benchmarkTracker";
import { optimizeTriggerDescription } from "../evals/triggerOptimizer";
import { compareOutputs, assessSkillNecessity, type ClinicalOutput } from "../evals/comparator";

const router = express.Router();

// ── Run eval suite ────────────────────────────────────────────────────────────

router.post("/run", async (req, res) => {
  const { skillName, cases, passThreshold } = req.body as {
    skillName?: string; cases?: EvalCase[]; passThreshold?: number;
  };
  if (!skillName || !Array.isArray(cases)) {
    return void res.status(400).json({ error: "skillName and cases[] required" });
  }
  const result = await runEvalSuite(skillName, cases, passThreshold);
  res.json(result);
});

// ── Regression check ──────────────────────────────────────────────────────────

router.post("/regression", async (req, res) => {
  const { skillName, cases, threshold } = req.body as {
    skillName?: string; cases?: EvalCase[]; threshold?: number;
  };
  if (!skillName || !Array.isArray(cases)) {
    return void res.status(400).json({ error: "skillName and cases[] required" });
  }
  const result = await runRegressionCheck(skillName, cases, threshold ?? 0.95);
  res.json(result);
});

// ── Benchmark ─────────────────────────────────────────────────────────────────

router.post("/benchmark", async (req, res) => {
  const { skillName, cases, skillVersion, modelName } = req.body as {
    skillName?: string; cases?: EvalCase[]; skillVersion?: string; modelName?: string;
  };
  if (!skillName || !Array.isArray(cases)) {
    return void res.status(400).json({ error: "skillName and cases[] required" });
  }
  const run = await runBenchmark(skillName, cases, skillVersion ?? "1.0.0", modelName ?? "claude-sonnet");
  res.json(run);
});

router.get("/benchmark/:skill", (req, res) => {
  const skill = req.params.skill;
  const history    = getBenchmarkHistory(skill);
  const comparison = compareBenchmarks(skill);
  res.json({ history, comparison });
});

// ── Trigger optimizer ─────────────────────────────────────────────────────────

router.post("/trigger-optimize", async (req, res) => {
  const { skillName, description, queries } = req.body as {
    skillName?: string; description?: string; queries?: string[];
  };
  if (!skillName || !description || !Array.isArray(queries)) {
    return void res.status(400).json({ error: "skillName, description, and queries[] required" });
  }
  const result = await optimizeTriggerDescription(skillName, description, queries);
  res.json(result);
});

// ── Blind comparator ──────────────────────────────────────────────────────────

router.post("/compare", (req, res) => {
  const { expected, outputA, outputB, passThreshold } = req.body as {
    expected?: ClinicalOutput; outputA?: ClinicalOutput; outputB?: ClinicalOutput; passThreshold?: number;
  };
  if (!expected || !outputA || !outputB) {
    return void res.status(400).json({ error: "expected, outputA, outputB required" });
  }
  const comparison = compareOutputs(expected, outputA, outputB, passThreshold);
  res.json(comparison);
});

// ── Skill necessity ───────────────────────────────────────────────────────────

router.post("/necessity", (req, res) => {
  const { withSkillScores, withoutSkillScores } = req.body as {
    withSkillScores?: number[]; withoutSkillScores?: number[];
  };
  if (!Array.isArray(withSkillScores) || !Array.isArray(withoutSkillScores)) {
    return void res.status(400).json({ error: "withSkillScores[] and withoutSkillScores[] required" });
  }
  res.json(assessSkillNecessity(withSkillScores, withoutSkillScores));
});

// ── Alerts ────────────────────────────────────────────────────────────────────

router.get("/alerts", (_req, res) => {
  res.json({ alerts: getAlerts() });
});

router.get("/alerts/:skill", (req, res) => {
  res.json({ alerts: getAlerts(req.params.skill) });
});

// ── Cases store ───────────────────────────────────────────────────────────────

router.post("/cases/:skill", (req, res) => {
  const { cases } = req.body as { cases?: EvalCase[] };
  if (!Array.isArray(cases)) return void res.status(400).json({ error: "cases[] required" });
  registerEvalCases(req.params.skill, cases);
  res.status(201).json({ registered: cases.length, skill: req.params.skill });
});

router.get("/cases/:skill", (req, res) => {
  res.json({ cases: getEvalCases(req.params.skill) });
});

export default router;
