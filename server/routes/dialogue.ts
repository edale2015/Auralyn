/**
 * dialogue.ts
 * REST API routes for the Adaptive Dialogue Engine and Care Intelligence Engine.
 * Mounted at /api/dialogue
 */

import { Router } from "express";
import { requireReviewAuth } from "../middleware/reviewAuth";
import { requireRole } from "../middleware/requireRole";
import {
  startSession,
  processResponse,
  getSession,
  generatePhysicianBriefing,
} from "../dialogue/AdaptiveDialogueEngine";
import {
  processPatientUpdate,
  getUnresolvedUpdates,
  resolveUpdate,
  getPatientSummary,
  getEncounterUpdateHistory,
  getPendingPhysicianAlerts,
} from "../inpatient/CareIntelligenceEngine";
import { db } from "../db";
import { sql } from "drizzle-orm";

const router = Router();
const physicianAuth = [requireReviewAuth, requireRole(["admin", "physician"])];

// ─── Dialogue Sessions ────────────────────────────────────────────────────────

/**
 * POST /api/dialogue/start
 * Start a new dialogue session for a patient encounter.
 */
router.post("/start", async (req, res) => {
  try {
    const {
      encounter_id, patient_id, complaint_id, chief_complaint,
      channel, age_years, sex,
    } = req.body;

    if (!encounter_id || !patient_id || !complaint_id || !chief_complaint) {
      return res.status(400).json({ ok: false, error: "encounter_id, patient_id, complaint_id, chief_complaint required" });
    }

    const result = await startSession({
      encounterId:    encounter_id,
      patientId:      patient_id,
      complaintId:    complaint_id,
      chiefComplaint: chief_complaint,
      channel,
      ageYears:       age_years,
      sex,
    });

    res.json({ ok: true, ...result });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * POST /api/dialogue/:id/respond
 * Process a patient response and advance the dialogue.
 */
router.post("/:id/respond", async (req, res) => {
  try {
    const { id } = req.params;
    const { answer } = req.body;
    if (!answer) return res.status(400).json({ ok: false, error: "answer required" });

    const result = await processResponse(id, answer);
    res.json({ ok: true, ...result });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * GET /api/dialogue/:id
 * Get current session state.
 */
router.get("/:id", async (req, res) => {
  try {
    const session = await getSession(req.params.id);
    if (!session) return res.status(404).json({ ok: false, error: "Session not found" });
    res.json({ ok: true, session });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * POST /api/dialogue/:id/briefing
 * Generate a physician briefing card from a completed session.
 */
router.post("/:id/briefing", ...physicianAuth, async (req, res) => {
  try {
    const briefing = await generatePhysicianBriefing(req.params.id);
    res.json({ ok: true, briefing });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── Physician Briefing Cards ─────────────────────────────────────────────────

/**
 * GET /api/dialogue/briefing/encounter/:encounterId
 * Get the latest briefing card for an encounter.
 */
router.get("/briefing/encounter/:encounterId", ...physicianAuth, async (req, res) => {
  try {
    const rows = await db.execute(sql`
      SELECT * FROM physician_briefing_cards
      WHERE encounter_id = ${req.params.encounterId}::uuid
      ORDER BY generated_at DESC LIMIT 1
    `);
    if (!rows.rows.length) return res.status(404).json({ ok: false, error: "No briefing found" });
    res.json({ ok: true, briefing: rows.rows[0] });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * POST /api/dialogue/briefing/:id/acknowledge
 * Physician acknowledges they have read the briefing.
 */
router.post("/briefing/:id/acknowledge", ...physicianAuth, async (req, res) => {
  try {
    await db.execute(sql`
      UPDATE physician_briefing_cards SET
        physician_acknowledged = true,
        physician_opened_at = NOW()
      WHERE id = ${req.params.id}::uuid
    `);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── Care Updates ─────────────────────────────────────────────────────────────

/**
 * POST /api/dialogue/updates/ingest
 * Process an inbound patient update message.
 */
router.post("/updates/ingest", async (req, res) => {
  try {
    const { encounter_id, patient_id, message, channel, prior_disposition } = req.body;
    if (!encounter_id || !patient_id || !message) {
      return res.status(400).json({ ok: false, error: "encounter_id, patient_id, message required" });
    }

    const result = await processPatientUpdate({
      encounterId:       encounter_id,
      patientId:         patient_id,
      message,
      channel,
      priorDisposition:  prior_disposition,
    });

    res.json({ ok: true, ...result });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * GET /api/dialogue/updates/encounter/:encounterId
 * Get all updates for an encounter.
 */
router.get("/updates/encounter/:encounterId", ...physicianAuth, async (req, res) => {
  try {
    const updates = await getEncounterUpdateHistory(req.params.encounterId);
    res.json({ ok: true, updates });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * GET /api/dialogue/updates/pending-alerts
 * Get all pending physician alerts across all encounters.
 */
router.get("/updates/pending-alerts", ...physicianAuth, async (req, res) => {
  try {
    const limit   = parseInt(String(req.query.limit ?? "20"));
    const alerts  = await getPendingPhysicianAlerts(limit);
    res.json({ ok: true, alerts });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * POST /api/dialogue/updates/:id/resolve
 * Mark an update as resolved with a physician response.
 */
router.post("/updates/:id/resolve", ...physicianAuth, async (req, res) => {
  try {
    const { response } = req.body;
    if (!response) return res.status(400).json({ ok: false, error: "response required" });
    await resolveUpdate(req.params.id, response);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── Patient-Facing Summary ───────────────────────────────────────────────────

/**
 * GET /api/dialogue/patient-summary/:shareToken
 * Patient-facing read endpoint (no auth — protected by secret token).
 */
router.get("/patient-summary/:shareToken", async (req, res) => {
  try {
    const summary = await getPatientSummary(req.params.shareToken);
    if (!summary) return res.status(404).json({ ok: false, error: "Summary not found" });
    res.json({ ok: true, summary });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;
