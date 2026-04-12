/**
 * Clinical Intelligence routes — /api/intel/*
 * Exposes sequential thinking, precision guideline lookup, and chart scanner.
 */

import express from "express";
import {
  sequentialThink, createThinkingTrace, recordStepFinding,
  concludeThinking, formatThinkingPlan,
} from "../reasoning/sequentialThinking";
import {
  precisionLookup, lookupByTag, lookupThreshold,
  formatLookupResult, listAllTags,
} from "../knowledge/precisionGuidelineLookup";
import {
  scanChart, formatScanResult,
} from "../clinical/chartCompletenessScanner";

const router = express.Router();

// ─────────────────────────────────────────────────────────────────────────────
// 1. Sequential Thinking
// ─────────────────────────────────────────────────────────────────────────────

router.post("/think", (req, res) => {
  try {
    const { patientId, chiefComplaint, vitals, knownHistory, urgency } = req.body;
    if (!patientId || !chiefComplaint) {
      res.status(400).json({ error: "patientId and chiefComplaint required" }); return;
    }
    const plan      = sequentialThink({ patientId, chiefComplaint, vitals, knownHistory, urgency });
    const formatted = formatThinkingPlan(plan);
    res.json({ plan, formatted, stepCount: plan.steps.length, assumptionCount: plan.assumptions.length });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

router.post("/think/trace", (req, res) => {
  try {
    const { patientId, chiefComplaint, vitals, urgency, stepFindings } = req.body;
    if (!patientId || !chiefComplaint) {
      res.status(400).json({ error: "patientId and chiefComplaint required" }); return;
    }

    const plan  = sequentialThink({ patientId, chiefComplaint, vitals, urgency });
    let trace   = createThinkingTrace(plan);

    // Apply any pre-supplied step findings
    if (Array.isArray(stepFindings)) {
      for (const { stepNumber, finding, confidence } of stepFindings) {
        trace = recordStepFinding(trace, stepNumber, finding, confidence ?? 0.8);
      }
    }

    trace = concludeThinking(trace);
    res.json({
      plan:      trace.plan,
      stepLogs:  trace.stepLogs,
      conclusion:trace.conclusion,
      formatted: formatThinkingPlan(plan),
    });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Precision Guideline Lookup
// ─────────────────────────────────────────────────────────────────────────────

router.post("/guidelines/lookup", (req, res) => {
  try {
    const { question, maxResults } = req.body;
    if (!question) { res.status(400).json({ error: "question required" }); return; }
    const result    = precisionLookup(question, maxResults ?? 3);
    const formatted = formatLookupResult(result);
    res.json({ ...result, formatted });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

router.get("/guidelines/tag/:tag", (req, res) => {
  const entries = lookupByTag(req.params.tag);
  res.json({ tag: req.params.tag, count: entries.length, entries });
});

router.get("/guidelines/threshold/:concept", (req, res) => {
  const result = lookupThreshold(req.params.concept);
  if (!result) { res.status(404).json({ error: `No threshold data for: ${req.params.concept}` }); return; }
  res.json(result);
});

router.get("/guidelines/tags", (_req, res) => {
  res.json({ tags: listAllTags() });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Chart Completeness Scanner
// ─────────────────────────────────────────────────────────────────────────────

router.post("/scan", (req, res) => {
  try {
    const chart = req.body;
    if (!chart.patientId || !chart.chiefComplaint) {
      res.status(400).json({ error: "patientId and chiefComplaint required" }); return;
    }
    const result    = scanChart(chart);
    const formatted = formatScanResult(result);
    res.json({ ...result, formatted });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

export default router;
