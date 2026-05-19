/**
 * dialogue.ts
 * REST API routes for the Adaptive Dialogue Engine and Care Intelligence Engine.
 * Mounted at /api/dialogue
 */

import { Router } from "express";
import { randomUUID } from "crypto";
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
import { processMessage, sendReply } from "../channels";
import { type MessageEvent } from "../channels/messageEvent";
import {
  addMessage,
  caseIdFromChannel,
  ensureConversation,
  setLastResult,
} from "../integrations/conversationStore";
import { addPatientMessage, addSystemMessage } from "../assistant/telemedicineSessionService";
import { handleWhatsAppKBIntake } from "../whatsapp/kbIntake";
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

// ─── WhatsApp Incoming (JSON gateway — no Twilio signature required) ──────────

/**
 * POST /api/dialogue/whatsapp/incoming
 * Accept an inbound WhatsApp message as JSON {Body, From} and run it through
 * the full triage pipeline. Useful for testing and non-Twilio integrations.
 * (Real Twilio traffic should use POST /whatsapp/webhook which enforces HMAC.)
 */
router.post("/whatsapp/incoming", async (req, res) => {
  const rawFrom: string = String(req.body?.From ?? "").trim();
  const text: string    = String(req.body?.Body ?? "").trim();
  const messageSid: string = String(req.body?.MessageSid ?? randomUUID());

  if (!rawFrom || !text) {
    return res.status(400).json({ ok: false, error: "From and Body are required" });
  }

  res.json({ ok: true, received: true, from: rawFrom, body: text });

  try {
    const externalUserId = rawFrom.replace(/^whatsapp:/, "");

    const kbHandled = await handleWhatsAppKBIntake({ from: rawFrom, text, messageSid }).catch((e: any) => {
      console.error("[WhatsApp/incoming] KB error:", e?.message);
      return false;
    });

    if (kbHandled) {
      console.log(`[WhatsApp/incoming] KB handled from=${rawFrom}`);
      return;
    }

    const event: MessageEvent = {
      channel:              "whatsapp",
      externalUserId,
      chatId:               externalUserId,
      text,
      timestamp:            new Date().toISOString(),
      messageId:            messageSid,
      rawSignatureVerified: false,
      media:                [],
    };

    const result = await processMessage(event);

    for (const reply of result.replies) {
      await sendReply(`whatsapp:${externalUserId}`, reply).catch((e: any) =>
        console.error("[WhatsApp/incoming] sendReply error:", e?.message)
      );
    }

    const caseId = caseIdFromChannel("whatsapp", externalUserId);
    ensureConversation(caseId, "whatsapp", externalUserId);
    addPatientMessage(caseId, text);

    if (result.replies.length > 0) {
      const summary = result.replies.join("\n---\n");
      addMessage(caseId, "assistant", summary, "whatsapp");
      addSystemMessage(caseId, `AI response sent — ${new Date().toLocaleTimeString()}`);
      setLastResult(caseId, result);
    }

    console.log(`[WhatsApp/incoming] caseId=${caseId} replies=${result.replies.length}`);
  } catch (err: any) {
    console.error("[WhatsApp/incoming] Error:", err?.message ?? err);
  }
});

// ─── Anatomical Diagram ───────────────────────────────────────────────────────

/**
 * GET /api/dialogue/patient-summary/:shareToken/diagram
 * Returns an anatomical diagram for the patient living encounter page.
 * No auth required — same token-based protection as the summary endpoint.
 */
router.get("/patient-summary/:shareToken/diagram", async (req, res) => {
  try {
    const { getDiagram } = await import("../diagrams/AnatomicalDiagramEngine");
    const summary = await getPatientSummary(req.params.shareToken);
    if (!summary) return res.status(404).json({ ok: false, error: "Summary not found" });

    const topDx = summary.summary?.topDifferentials?.[0]?.name ?? "";
    const complaintId = summary.summary?.complaintId ?? summary.complaintId ?? "unknown";
    const certainty =
      (summary.summary?.confidence ?? 0) >= 0.8 ? "confirmed" :
      (summary.summary?.confidence ?? 0) >= 0.6 ? "probable"  :
      (summary.summary?.confidence ?? 0) >= 0.4 ? "possible"  :
      "uncertain";

    const diagram = getDiagram({
      complaintId,
      primaryDiagnosis: topDx || complaintId,
      certaintyLevel:   certainty as any,
      patientAge:       summary.summary?.ageYears,
      patientSex:       summary.summary?.sex as any,
      redFlagsPresent:  summary.summary?.criticalGaps ?? [],
      keyFindings:      summary.summary?.keyFindings ?? {},
    });

    res.json({ ok: true, diagram });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;
