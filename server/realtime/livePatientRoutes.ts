/**
 * Live Patient Routes — /api/patients/*
 * Feeds current patient state + AI insights to the frontend.
 *
 * INDEPENDENT REVIEW FIX:
 *   GET /live and GET /live/stats returned full patient objects (PHI) with zero
 *   authentication — any browser tab or HTTP client could enumerate all live patients.
 *   Added requireRole() to all routes. Insight/intervention endpoints already had
 *   try/catch; the GET endpoints did not need it (synchronous engine reads).
 */

import express from "express";
import { requireRole }      from "../middleware/requireRole";
import { requirePhysician } from "../auth/requirePhysician";
import { getCurrentPatients, getEngineStats } from "./livePatientEngine";
import { generatePatientInsight }              from "../llm/insightEngine";
import { generateInterventions }               from "../engines/interventionEngine";

const router = express.Router();

// Phase 2 Fix: Apply requirePhysician globally on this router.
// Previously only per-route requireRole("staff") — but "staff" includes non-clinical
// roles that should not receive live patient PHI streams in a multi-tenant context.
// requirePhysician sets req.physician with clinicId-bound identity; all downstream
// handlers can use req.physician.clinicId for tenant-scoped filtering.
router.use(requirePhysician);

// All routes require at minimum "staff" — they expose live patient data (PHI).
const requireStaff = requireRole(["admin", "physician", "nurse", "staff"]);

// Current live patient state
router.get("/live", requireStaff, (_req, res) => {
  res.json({ patients: getCurrentPatients(), stats: getEngineStats(), timestamp: new Date().toISOString() });
});

// Engine health — still gated; exposes patient count + throughput metrics
router.get("/live/stats", requireStaff, (_req, res) => {
  res.json(getEngineStats());
});

// AI insight for a single patient by current vitals (POST body = vitals)
router.post("/insights", requireStaff, async (req, res) => {
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
router.post("/insights/batch", requireStaff, async (req, res) => {
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
router.post("/interventions", requireStaff, (req, res) => {
  try {
    const { hr = 80, spo2 = 98, temp = 98.6, systolicBP = 120, rr } = req.body;
    res.json(generateInterventions({ hr, spo2, temp, systolicBP, rr }));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
