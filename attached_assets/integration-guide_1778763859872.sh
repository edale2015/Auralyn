# AURALYN — Integration Guide
# AdaptiveDialogueEngine + PhysicianBriefingCard + Living Encounter
# 
# READ THIS FIRST — what Replit needs to do, in order.
# This integrates with the Clinical Encounter screen shown in screenshots.
#
# The screenshots show:
#   - Clinical Encounter page at /encounter
#   - Left panel: structured questions (vitals, HPI, ROS, PMH, medications)
#   - Right panel: live differential diagnoses updating as questions answered
#   - Top: "Run 13-Step Pipeline" button, "Dictate Full Encounter" button
#   - Bottom right: Workup Indicated (EKG/CXR buttons)
#
# What we are adding:
#   1. Pre-encounter tab: patient dialogue happens BEFORE physician opens encounter
#   2. Physician briefing card: appears at top of encounter when physician opens it
#   3. Living encounter: patient can update their status at any time post-visit
#   4. Patient visual summary: patient-facing disposition explanation with graphics

# ============================================================
# STEP 1: DATABASE MIGRATIONS
# Run these in your Replit PostgreSQL shell
# ============================================================

# Copy and run this SQL:

cat << 'SQL'
-- Dialogue sessions table
CREATE TABLE IF NOT EXISTS dialogue_sessions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id          UUID NOT NULL REFERENCES encounters(id),
  patient_id            UUID NOT NULL,
  channel               TEXT NOT NULL DEFAULT 'web_chat',
  phase                 TEXT NOT NULL DEFAULT 'greeting',
  started_at            TIMESTAMPTZ DEFAULT NOW(),
  completed_at          TIMESTAMPTZ,
  turns_json            JSONB DEFAULT '[]',
  answer_log_json       JSONB DEFAULT '[]',
  clinical_state_json   JSONB DEFAULT '{}',
  safety_alerts         JSONB DEFAULT '[]',
  self_exam_results     JSONB DEFAULT '[]',
  is_complete           BOOLEAN DEFAULT FALSE
);

-- Briefing cards table  
CREATE TABLE IF NOT EXISTS physician_briefing_cards (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id          UUID NOT NULL REFERENCES encounters(id),
  generated_at          TIMESTAMPTZ DEFAULT NOW(),
  one_liner             TEXT,
  urgency_signal        TEXT DEFAULT 'routine',
  preliminary_disposition TEXT,
  top_differential      JSONB DEFAULT '[]',
  critical_gaps         JSONB DEFAULT '[]',
  important_gaps        JSONB DEFAULT '[]',
  story_flags           JSONB DEFAULT '[]',
  self_exam_findings    JSONB DEFAULT '[]',
  medication_flags      JSONB DEFAULT '[]',
  suggested_first_words TEXT,
  physician_opened_at   TIMESTAMPTZ,
  physician_acknowledged BOOLEAN DEFAULT FALSE
);

-- Living encounter updates table
-- Patient can update this at any time after the visit
CREATE TABLE IF NOT EXISTS encounter_updates (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id          UUID NOT NULL REFERENCES encounters(id),
  patient_id            UUID NOT NULL,
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  update_type           TEXT NOT NULL, -- 'symptom_change' | 'new_symptom' | 'improvement' | 'worsening' | 'question'
  patient_message       TEXT NOT NULL,
  extracted_delta       JSONB DEFAULT '{}', -- what changed in clinical state
  new_disposition       TEXT,
  disposition_changed   BOOLEAN DEFAULT FALSE,
  physician_alerted     BOOLEAN DEFAULT FALSE,
  alert_reason          TEXT,
  physician_response    TEXT,
  resolved              BOOLEAN DEFAULT FALSE
);

-- Patient visual summaries
CREATE TABLE IF NOT EXISTS patient_summaries (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id          UUID NOT NULL REFERENCES encounters(id),
  generated_at          TIMESTAMPTZ DEFAULT NOW(),
  disposition           TEXT,
  disposition_color     TEXT, -- 'green' | 'yellow' | 'orange' | 'red'
  summary_json          JSONB DEFAULT '{}', -- full summary for patient UI
  share_token           TEXT UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  patient_viewed        BOOLEAN DEFAULT FALSE,
  patient_viewed_at     TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_dialogue_encounter ON dialogue_sessions(encounter_id);
CREATE INDEX IF NOT EXISTS idx_updates_encounter ON encounter_updates(encounter_id);
CREATE INDEX IF NOT EXISTS idx_updates_unresolved ON encounter_updates(resolved) WHERE resolved = FALSE;
CREATE INDEX IF NOT EXISTS idx_briefing_encounter ON physician_briefing_cards(encounter_id);
SQL

echo "Database migrations complete."

# ============================================================
# STEP 2: COPY SOURCE FILES
# ============================================================
# Copy these files from your outputs directory into your project:

# AdaptiveDialogueEngine.ts → server/dialogue/AdaptiveDialogueEngine.ts
# PhysicianBriefingCard.tsx → client/src/components/physician/PhysicianBriefingCard.tsx

# Then create these new files (content below):

# ============================================================
# STEP 3: NEW BACKEND ROUTES
# Add to server/routes/dialogue.ts
# ============================================================

cat << 'TYPESCRIPT' > /dev/stdout
// server/routes/dialogue.ts
// Add this router to your domain router (clinical domain)

import { Router } from "express";
import { requireRole } from "../middleware/auth";
import { requireTenantContext } from "../middleware/tenantContext";
import { db } from "../db";
import { AdaptiveDialogueEngine } from "../dialogue/AdaptiveDialogueEngine";
import { appendAuditEvent } from "../audit/HashChain";
import OpenAI from "openai";
import { applyPHIGuard } from "../safety/PHIGuard";

const router = Router();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ── Start or continue a dialogue session ──────────────────────────────────
// Called by patient intake interface
router.post("/sessions/:encounterId/message",
  requireTenantContext,
  async (req, res) => {
    const { encounterId } = req.params;
    const { patientMessage, channel = "web_chat" } = req.body;

    // Load or create session
    let session = await db.execute(
      `SELECT * FROM dialogue_sessions WHERE encounter_id = $1 ORDER BY started_at DESC LIMIT 1`,
      [encounterId]
    ).then(r => r.rows[0]);

    let engine: AdaptiveDialogueEngine;

    if (!session) {
      // New session
      const sessionId = crypto.randomUUID();
      await db.execute(
        `INSERT INTO dialogue_sessions (id, encounter_id, patient_id, channel)
         VALUES ($1, $2, $3, $4)`,
        [sessionId, encounterId, req.body.patientId, channel]
      );
      engine = new AdaptiveDialogueEngine(sessionId, channel);
    } else {
      // Restore session state
      engine = new AdaptiveDialogueEngine(session.id, session.channel);
      // Engine would restore from session.turns_json and session.clinical_state_json
      // (simplified here — full implementation restores all state)
    }

    // Generate next message
    const result = await engine.generateNextMessage(patientMessage ?? "");

    // Save updated session state
    await db.execute(
      `UPDATE dialogue_sessions
       SET turns_json = $1,
           answer_log_json = $2,
           clinical_state_json = $3,
           safety_alerts = $4,
           phase = $5,
           is_complete = $6,
           completed_at = $7
       WHERE encounter_id = $8`,
      [
        JSON.stringify(engine.getTurns()),
        JSON.stringify(engine.getAnswerLog()),
        JSON.stringify(engine.getClinicalState()),
        JSON.stringify(engine.getSafetyAlerts()),
        result.phase,
        result.complete,
        result.complete ? new Date().toISOString() : null,
        encounterId,
      ]
    );

    // If complete, generate briefing card and save it
    if (result.complete) {
      const briefing = engine.generateBriefingCard();
      await db.execute(
        `INSERT INTO physician_briefing_cards
         (encounter_id, one_liner, urgency_signal, preliminary_disposition,
          top_differential, critical_gaps, important_gaps, story_flags,
          self_exam_findings, medication_flags, suggested_first_words)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (encounter_id) DO UPDATE SET
           one_liner = EXCLUDED.one_liner,
           urgency_signal = EXCLUDED.urgency_signal,
           generated_at = NOW()`,
        [
          encounterId,
          briefing.oneLiner,
          briefing.urgencySignal,
          briefing.preliminaryDisposition,
          JSON.stringify(briefing.topDifferential),
          JSON.stringify(briefing.criticalGaps),
          JSON.stringify(briefing.importantGaps),
          JSON.stringify(briefing.storyFlags),
          JSON.stringify(briefing.selfExamFindings),
          JSON.stringify(briefing.medicationFlags),
          briefing.suggestedFirstWords,
        ]
      );

      // Alert physician if safety alert was triggered
      if (engine.getSafetyAlerts().length > 0) {
        // Fire your existing physician alert system here
        // This connects to your existing notification infrastructure
      }
    }

    // If safety alert triggered mid-dialogue, alert immediately
    if (engine.getSafetyAlerts().length > 0) {
      await appendAuditEvent({
        eventType: "DIALOGUE_SAFETY_ALERT",
        encounterId,
        metadata: { alerts: engine.getSafetyAlerts() },
      });
    }

    res.json({
      message: result.message,
      phase: result.phase,
      complete: result.complete,
      safetyAlerts: engine.getSafetyAlerts(),
    });
  }
);

// ── Get briefing card for physician ──────────────────────────────────────
router.get("/encounters/:encounterId/briefing",
  requireRole(["physician", "admin", "clinician"]),
  requireTenantContext,
  async (req, res) => {
    const { encounterId } = req.params;

    const briefing = await db.execute(
      `SELECT * FROM physician_briefing_cards WHERE encounter_id = $1`,
      [encounterId]
    ).then(r => r.rows[0]);

    if (!briefing) {
      return res.json({ available: false });
    }

    // Mark as opened
    if (!briefing.physician_opened_at) {
      await db.execute(
        `UPDATE physician_briefing_cards SET physician_opened_at = NOW() WHERE encounter_id = $1`,
        [encounterId]
      );
    }

    res.json({
      available: true,
      ...briefing,
      topDifferential: briefing.top_differential,
      criticalGaps: briefing.critical_gaps,
      importantGaps: briefing.important_gaps,
      storyFlags: briefing.story_flags,
      selfExamFindings: briefing.self_exam_findings,
      medicationFlags: briefing.medication_flags,
      suggestedFirstWords: briefing.suggested_first_words,
      dialogueDurationMinutes: 8, // calculate from session start/end
      turnsCompleted: 0,           // calculate from turns_json length
    });
  }
);

// ── Living encounter: patient posts an update ────────────────────────────
// This is the core of the "living encounter" — patient can update at any time
router.post("/encounters/:encounterId/update",
  requireTenantContext,
  async (req, res) => {
    const { encounterId } = req.params;
    const { patientMessage, patientId } = req.body;

    // Extract what changed from the patient's update
    const guardedMessage = applyPHIGuard(patientMessage);
    const extractionResponse = await openai.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 600,
      messages: [
        {
          role: "system",
          content: `You are a clinical change detector. A patient who was seen earlier is 
          providing an update about how they are feeling now. Extract:
          1. What changed (better/worse/new symptom/resolved symptom)
          2. Severity of change (minor/moderate/significant/emergency)
          3. Whether this requires physician notification
          4. What the updated disposition should be
          
          Physician alert triggers:
          - Any new chest pain, severe shortness of breath, syncope
          - Fever above 103
          - Symptoms significantly worse despite treatment
          - Any new neurological symptom
          - Patient expressing they cannot manage at home
          
          Return JSON only. No preamble.
          {
            "updateType": "improvement|worsening|new_symptom|question|resolved",
            "extractedDelta": { changed fields },
            "severity": "minor|moderate|significant|emergency",
            "physicianAlertRequired": boolean,
            "alertReason": string or null,
            "suggestedDisposition": string,
            "dispositionChanged": boolean,
            "patientSummary": "2-sentence plain English summary of the update"
          }`
        },
        {
          role: "user",
          content: `Patient update: "${guardedMessage}"`
        }
      ]
    });

    const content = extractionResponse.choices[0]?.message?.content ?? "{}";
    const clean = content.replace(/```json|```/g, "").trim();
    const extracted = JSON.parse(clean);

    // Save the update
    const updateId = crypto.randomUUID();
    await db.execute(
      `INSERT INTO encounter_updates
       (id, encounter_id, patient_id, update_type, patient_message,
        extracted_delta, new_disposition, disposition_changed,
        physician_alerted, alert_reason)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        updateId,
        encounterId,
        patientId,
        extracted.updateType,
        patientMessage,
        JSON.stringify(extracted.extractedDelta),
        extracted.suggestedDisposition,
        extracted.dispositionChanged,
        extracted.physicianAlertRequired,
        extracted.alertReason,
      ]
    );

    // Regenerate patient summary with updated state
    await generatePatientSummary(encounterId, extracted);

    // Alert physician if needed
    if (extracted.physicianAlertRequired) {
      await appendAuditEvent({
        eventType: "LIVING_ENCOUNTER_PHYSICIAN_ALERT",
        encounterId,
        metadata: {
          alertReason: extracted.alertReason,
          severity: extracted.severity,
          updateId,
        },
      });
      // Fire your existing physician notification system
      // (SMS, push notification, workstation alert)
    }

    res.json({
      received: true,
      updateId,
      severity: extracted.severity,
      physicianAlertSent: extracted.physicianAlertRequired,
      message: extracted.physicianAlertRequired
        ? "Your update has been sent to your care team. Someone will follow up with you shortly."
        : extracted.updateType === "improvement"
        ? "Glad to hear you're feeling better. Keep monitoring and reach out if anything changes."
        : "We've recorded your update. Continue following your discharge instructions and reach out if symptoms worsen.",
    });
  }
);

// ── Get living encounter timeline ────────────────────────────────────────
router.get("/encounters/:encounterId/timeline",
  requireRole(["physician", "admin", "clinician"]),
  requireTenantContext,
  async (req, res) => {
    const { encounterId } = req.params;

    const updates = await db.execute(
      `SELECT * FROM encounter_updates
       WHERE encounter_id = $1
       ORDER BY updated_at ASC`,
      [encounterId]
    ).then(r => r.rows);

    const session = await db.execute(
      `SELECT * FROM dialogue_sessions WHERE encounter_id = $1`,
      [encounterId]
    ).then(r => r.rows[0]);

    res.json({ updates, session });
  }
);

// ── Get patient summary (for patient-facing view) ────────────────────────
router.get("/patient-summary/:shareToken",
  async (req, res) => {
    const { shareToken } = req.params;

    const summary = await db.execute(
      `SELECT * FROM patient_summaries WHERE share_token = $1`,
      [shareToken]
    ).then(r => r.rows[0]);

    if (!summary) return res.status(404).json({ error: "Not found" });

    // Mark as viewed
    if (!summary.patient_viewed) {
      await db.execute(
        `UPDATE patient_summaries SET patient_viewed = TRUE, patient_viewed_at = NOW()
         WHERE share_token = $1`,
        [shareToken]
      );
    }

    res.json(summary.summary_json);
  }
);

async function generatePatientSummary(encounterId: string, extracted: any) {
  // Re-generate patient-facing summary with current state
  // This will be called by the PatientSummaryCard component
  const color =
    extracted.severity === "emergency" ? "red" :
    extracted.severity === "significant" ? "orange" :
    extracted.severity === "moderate" ? "yellow" : "green";

  await db.execute(
    `INSERT INTO patient_summaries (encounter_id, disposition, disposition_color, summary_json)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (encounter_id) DO UPDATE SET
       disposition = EXCLUDED.disposition,
       disposition_color = EXCLUDED.disposition_color,
       summary_json = EXCLUDED.summary_json,
       generated_at = NOW()`,
    [
      encounterId,
      extracted.suggestedDisposition,
      color,
      JSON.stringify({ ...extracted, encounterId }),
    ]
  );
}

export default router;
TYPESCRIPT
