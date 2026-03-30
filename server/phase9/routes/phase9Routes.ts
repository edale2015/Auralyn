/**
 * Phase 9 API Routes
 *
 * POST /api/phase9/debate         — run multi-agent clinical debate
 * GET  /api/phase9/executive      — executive command dashboard
 * GET  /api/phase9/learning/run   — run continuous learning pass
 * GET  /api/phase9/policy         — current policy weights
 * POST /api/phase9/policy/evolve  — trigger policy evolution
 * GET  /api/phase9/policy/history — evolution history
 * POST /api/phase9/outcome        — record an outcome for learning
 */

import { Router } from "express";
import { runDebate, getDebateAgentStats } from "../debate/debateEngine";
import { getExecutiveSummary }            from "../executive/executiveDashboard";
import { runContinuousLearning }          from "../learning/continuousLearning";
import { getPolicyWeights, evolvePolicy, getPolicyHistory, getCurrentPolicyMode } from "../learning/policyEvolution";
import { recordOutcome }                  from "../../outcomes/outcomeTracker";

export const phase9Routes = Router();

/* ── debate ─────────────────────────────────────────────────────────────── */
phase9Routes.post("/debate", async (req, res) => {
  try {
    const { symptoms = [], complaint = "unspecified", vitals, pregnant, age } = req.body;
    if (!Array.isArray(symptoms) || symptoms.length === 0) {
      return res.status(400).json({ error: "symptoms[] is required" });
    }
    const result = await runDebate({ symptoms, complaint, vitals, pregnant, age });
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Debate failed" });
  }
});

phase9Routes.get("/debate/agent-stats", async (_req, res) => {
  try {
    const stats = await getDebateAgentStats();
    return res.json(stats);
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Stats failed" });
  }
});

/* ── executive dashboard ────────────────────────────────────────────────── */
phase9Routes.get("/executive", async (_req, res) => {
  try {
    const summary = await getExecutiveSummary();
    return res.json(summary);
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Executive summary failed" });
  }
});

/* ── continuous learning ────────────────────────────────────────────────── */
phase9Routes.get("/learning/run", async (_req, res) => {
  try {
    const result = await runContinuousLearning();
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Learning run failed" });
  }
});

/* ── policy evolution ───────────────────────────────────────────────────── */
phase9Routes.get("/policy", async (_req, res) => {
  try {
    const weights = await getPolicyWeights();
    const mode    = await getCurrentPolicyMode(weights);
    return res.json({ weights, mode });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Policy fetch failed" });
  }
});

phase9Routes.post("/policy/evolve", async (_req, res) => {
  try {
    const result = await evolvePolicy();
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Policy evolution failed" });
  }
});

phase9Routes.get("/policy/history", async (_req, res) => {
  try {
    const history = await getPolicyHistory();
    return res.json({ history, count: history.length });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Policy history failed" });
  }
});

/* ── outcome recording ──────────────────────────────────────────────────── */
phase9Routes.post("/outcome", (req, res) => {
  try {
    const { caseId, predictedDiagnosis, actualDiagnosis, predictedDisposition, actualDisposition } = req.body;
    if (!caseId || !predictedDiagnosis || !actualDiagnosis || !predictedDisposition) {
      return res.status(400).json({ error: "caseId, predictedDiagnosis, actualDiagnosis, predictedDisposition required" });
    }
    const outcome = recordOutcome(caseId, predictedDiagnosis, actualDiagnosis, predictedDisposition, actualDisposition);
    return res.json({ recorded: true, outcome });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Outcome recording failed" });
  }
});
