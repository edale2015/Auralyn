import express from "express";
import { generateComplaintDriftAlerts } from "../learning/complaintDriftAlerts";
import { generateTuningSuggestionsFromReconciliations } from "../learning/tuningSuggestionEngine";

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

export default router;
