/**
 * Live Patient Routes — /api/patients/*
 * Feeds current patient state + AI insights to the frontend.
 */

import express from "express";
import { getCurrentPatients, getEngineStats } from "./livePatientEngine";
import { generatePatientInsight }              from "../llm/insightEngine";
import { generateInterventions }               from "../engines/interventionEngine";

const router = express.Router();

// Current live patient state
router.get("/live", (_req, res) => {
  res.json({ patients: getCurrentPatients(), stats: getEngineStats(), timestamp: new Date().toISOString() });
});

// Engine health
router.get("/live/stats", (_req, res) => {
  res.json(getEngineStats());
});

// AI insight for a single patient by current vitals (POST body = vitals)
router.post("/insights", async (req, res) => {
  try {
    const { patientId = "unknown", name = "Patient", vitals } = req.body;
    if (!vitals) { res.status(400).json({ error: "vitals required" }); return; }

    const insight = await generatePatientInsight(patientId, name, vitals);
    res.json(insight);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Batch insights for all current patients (expensive — call sparingly)
router.post("/insights/batch", async (req, res) => {
  try {
    const patients = getCurrentPatients();
    const insights = await Promise.all(
      patients.map((p) => generatePatientInsight(String(p.id), p.name, p.vitals).then((insight) => ({ patientId: p.id, insight })))
    );
    res.json(insights);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Interventions for ad-hoc vitals (used by command center quick-run)
router.post("/interventions", (req, res) => {
  try {
    const { hr = 80, spo2 = 98, temp = 98.6, systolicBP = 120, rr } = req.body;
    res.json(generateInterventions({ hr, spo2, temp, systolicBP, rr }));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
