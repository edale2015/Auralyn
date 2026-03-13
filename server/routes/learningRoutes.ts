import express from "express";
import { generateComplaintDriftAlerts } from "../learning/complaintDriftAlerts";
import { generateTuningSuggestionsFromReconciliations } from "../learning/tuningSuggestionEngine";
import { generateFailureDrivenRuleSuggestions } from "../learning/failureDrivenRuleSuggester";
import { batchExplainabilityScores, computeExplainabilityScore } from "../learning/explainabilityScorer";

const router = express.Router();

router.get("/api/skill-layer/drift-alerts", async (_req, res) => {
  try {
    const alerts = await generateComplaintDriftAlerts();
    res.json({ ok: true, alerts });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message ?? "unknown_error" });
  }
});

router.get("/api/skill-layer/tuning-suggestions", async (_req, res) => {
  try {
    const suggestions = await generateTuningSuggestionsFromReconciliations();
    res.json({ ok: true, suggestions });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message ?? "unknown_error" });
  }
});

router.get("/api/skill-layer/learning/rule-suggestions", async (_req, res) => {
  try {
    const suggestions = await generateFailureDrivenRuleSuggestions();
    res.json({ ok: true, suggestions });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message ?? "unknown_error" });
  }
});

router.get("/api/skill-layer/learning/explainability", async (_req, res) => {
  try {
    const scores = await batchExplainabilityScores(50);
    res.json({ ok: true, scores });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message ?? "unknown_error" });
  }
});

router.get("/api/skill-layer/learning/explainability/:caseId", async (req, res) => {
  try {
    const score = await computeExplainabilityScore(req.params.caseId);
    res.json({ ok: true, score });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message ?? "unknown_error" });
  }
});

export default router;
