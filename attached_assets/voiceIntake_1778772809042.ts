/**
 * AURALYN — Voice Bridge
 * Connects Twilio Voice (phone call or in-room speaker) to the
 * AdaptiveDialogueEngine. This is the last mile for voice intake.
 *
 * How it works:
 *   1. Patient calls the clinic number (or in-room tablet initiates call)
 *   2. Twilio receives the call, hits POST /api/voice/intake/incoming
 *   3. We respond with TwiML that speaks the first question
 *   4. Patient speaks their answer
 *   5. Twilio transcribes via <Gather> and hits POST /api/voice/intake/respond
 *   6. We run it through AdaptiveDialogueEngine, speak the next question
 *   7. Loop until dialogue complete — then generate briefing card
 *
 * File: server/routes/voiceIntake.ts
 */

import { Router } from "express";
import twilio from "twilio";
import { db } from "../db";
import { AdaptiveDialogueEngine } from "../dialogue/AdaptiveDialogueEngine";
import { appendAuditEvent } from "../audit/HashChain";

const router = Router();
const VoiceResponse = twilio.twiml.VoiceResponse;

// Validate all Twilio webhooks (already in your stack per T03)
const validateTwilio = twilio.webhook({ validate: true });

// ── Incoming call — speak greeting and first question ─────────────────────
router.post("/incoming", validateTwilio, async (req, res) => {
  const callSid = req.body.CallSid;
  const fromNumber = req.body.From;

  // Create a new dialogue session for this call
  const sessionId = crypto.randomUUID();
  const encounterId = crypto.randomUUID(); // or look up by phone number

  await db.execute(
    `INSERT INTO dialogue_sessions
     (id, encounter_id, patient_id, channel, phase)
     VALUES ($1, $2, $3, 'voice_phone', 'greeting')`,
    [sessionId, encounterId, fromNumber]
  );

  // Store callSid → sessionId mapping for subsequent webhooks
  await db.execute(
    `INSERT INTO voice_call_sessions (call_sid, session_id, encounter_id)
     VALUES ($1, $2, $3)`,
    [callSid, sessionId, encounterId]
  );

  const engine = new AdaptiveDialogueEngine(sessionId, "voice_phone");
  const first = await engine.generateNextMessage("");

  // Save initial state
  await saveEngineState(engine, sessionId);

  // Respond with TwiML
  const twiml = new VoiceResponse();
  twiml.say({
    voice: "Polly.Joanna-Neural", // Natural-sounding AWS Polly voice
    language: "en-US",
  }, cleanForSpeech(first.message));

  if (!first.complete) {
    // Gather patient's spoken response
    const gather = twiml.gather({
      input: ["speech"],
      action: `/api/voice/intake/respond?sid=${sessionId}`,
      method: "POST",
      speechTimeout: "auto",
      speechModel: "phone_call",
      enhanced: true,
      language: "en-US",
      timeout: 8,
    });
    // Silence during gather — question already spoken above
    gather.pause({ length: 1 });

    // If no speech detected, prompt gently
    twiml.say({
      voice: "Polly.Joanna-Neural",
    }, "I didn't catch that. Please tell me your answer when you're ready.");
    twiml.redirect(`/api/voice/intake/respond?sid=${sessionId}&timeout=true`);
  } else {
    twiml.say({ voice: "Polly.Joanna-Neural" },
      "Thank you. Your information has been recorded. The doctor will be with you shortly."
    );
    twiml.hangup();
  }

  res.type("text/xml").send(twiml.toString());
});

// ── Patient spoke — process answer, ask next question ─────────────────────
router.post("/respond", validateTwilio, async (req, res) => {
  const sessionId = req.query.sid as string;
  const timedOut = req.query.timeout === "true";

  // Get transcribed speech from Twilio
  const spokenText = timedOut ? "[no response]" : (req.body.SpeechResult || "");
  const confidence = parseFloat(req.body.Confidence || "0");

  // Restore engine from DB
  const session = await db.execute(
    `SELECT * FROM dialogue_sessions WHERE id = $1`,
    [sessionId]
  ).then(r => r.rows[0]);

  if (!session) {
    const twiml = new VoiceResponse();
    twiml.say({ voice: "Polly.Joanna-Neural" },
      "I'm sorry, something went wrong. Please call us back."
    );
    twiml.hangup();
    return res.type("text/xml").send(twiml.toString());
  }

  const engine = await AdaptiveDialogueEngine.fromSession(sessionId, "voice_phone");

  // Log low-confidence transcriptions for physician review
  if (confidence < 0.6 && spokenText) {
    await appendAuditEvent({
      eventType: "VOICE_LOW_CONFIDENCE_TRANSCRIPTION",
      metadata: { sessionId, spokenText, confidence },
    });
  }

  // Process the spoken answer
  const result = await engine.generateNextMessage(spokenText);
  await saveEngineState(engine, sessionId);

  const twiml = new VoiceResponse();

  // Check safety alerts — if triggered, transfer to front desk immediately
  if (engine.getSafetyAlerts().length > 0) {
    twiml.say({ voice: "Polly.Joanna-Neural" },
      "What you've described needs immediate attention. I'm connecting you to our staff right now. Please stay on the line."
    );
    twiml.dial(process.env.CLINIC_FRONT_DESK_NUMBER || "");
    return res.type("text/xml").send(twiml.toString());
  }

  if (result.complete) {
    // Generate briefing card
    const briefing = engine.generateBriefingCard();
    await saveBriefingCard(briefing, session.encounter_id);

    // Alert physician that patient intake is complete
    await notifyPhysician(session.encounter_id, briefing.urgencySignal);

    twiml.say({ voice: "Polly.Joanna-Neural" },
      result.message + " " +
      "Your information has been sent to your care team. Please let the front desk know you have completed this questionnaire."
    );
    twiml.hangup();
  } else {
    // Speak next question
    twiml.say({ voice: "Polly.Joanna-Neural" }, cleanForSpeech(result.message));

    const gather = twiml.gather({
      input: ["speech"],
      action: `/api/voice/intake/respond?sid=${sessionId}`,
      method: "POST",
      speechTimeout: "auto",
      speechModel: "phone_call",
      enhanced: true,
      language: "en-US",
      timeout: 8,
    });
    gather.pause({ length: 1 });

    twiml.say({ voice: "Polly.Joanna-Neural" },
      "I didn't catch that. Could you say that again?"
    );
    twiml.redirect(`/api/voice/intake/respond?sid=${sessionId}`);
  }

  res.type("text/xml").send(twiml.toString());
});

// ── Language detection and routing ────────────────────────────────────────
// Twilio supports gathering in different languages.
// If patient speaks Spanish, redirect to Spanish dialogue.
router.post("/language-select", validateTwilio, async (req, res) => {
  const twiml = new VoiceResponse();

  twiml.say({ voice: "Polly.Joanna-Neural", language: "en-US" },
    "For English, press 1 or say English."
  );
  twiml.say({ voice: "Polly.Lupe-Neural", language: "es-US" },
    "Para español, oprima 2 o diga español."
  );

  const gather = twiml.gather({
    input: ["speech", "dtmf"],
    action: "/api/voice/intake/language-chosen",
    numDigits: 1,
    timeout: 5,
    language: "en-US",
  });

  res.type("text/xml").send(twiml.toString());
});

// ── Utility functions ─────────────────────────────────────────────────────

function cleanForSpeech(text: string): string {
  // Remove markdown, parentheses explanations, and anything that
  // sounds odd when spoken aloud.
  return text
    .replace(/\*\*/g, "")           // remove bold markers
    .replace(/\*/g, "")             // remove italic markers
    .replace(/\[.*?\]/g, "")        // remove markdown links
    .replace(/\(e\.g\.[^)]*\)/g, "") // remove examples
    .replace(/0-10/g, "zero to ten")
    .replace(/RLQ|LLQ|RUQ|LUQ/g, "your abdomen") // no acronyms in voice
    .replace(/\n/g, " ")
    .trim();
}

async function saveEngineState(engine: AdaptiveDialogueEngine, sessionId: string) {
  await db.execute(
    `UPDATE dialogue_sessions
     SET turns_json = $1,
         answer_log_json = $2,
         clinical_state_json = $3,
         safety_alerts = $4,
         updated_at = NOW()
     WHERE id = $5`,
    [
      JSON.stringify(engine.getTurns()),
      JSON.stringify(engine.getAnswerLog()),
      JSON.stringify(engine.getClinicalState()),
      JSON.stringify(engine.getSafetyAlerts()),
      sessionId,
    ]
  );
}

async function saveBriefingCard(briefing: any, encounterId: string) {
  await db.execute(
    `INSERT INTO physician_briefing_cards
     (encounter_id, one_liner, urgency_signal, preliminary_disposition,
      top_differential, critical_gaps, story_flags, medication_flags,
      suggested_first_words)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
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
      JSON.stringify(briefing.storyFlags),
      JSON.stringify(briefing.medicationFlags),
      briefing.suggestedFirstWords,
    ]
  );
}

async function notifyPhysician(encounterId: string, urgency: string) {
  // Connect to your existing physician notification system
  // For immediate urgency, send SMS via Twilio
  // For routine, update the workstation dashboard
  console.log(`[VoiceIntake] Intake complete for ${encounterId} — urgency: ${urgency}`);
}

export default router;

/**
 * REGISTER IN server/index.ts or your main app file:
 *
 * import voiceIntakeRouter from "./routes/voiceIntake";
 * app.use("/api/voice/intake", voiceIntakeRouter);
 *
 * ALSO ADD to Twilio console:
 * Your clinic phone number → Voice webhook → POST https://yourdomain.com/api/voice/intake/incoming
 *
 * ALSO ADD this table:
 * CREATE TABLE voice_call_sessions (
 *   call_sid TEXT PRIMARY KEY,
 *   session_id UUID NOT NULL,
 *   encounter_id UUID NOT NULL,
 *   created_at TIMESTAMPTZ DEFAULT NOW()
 * );
 */
