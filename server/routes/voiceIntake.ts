/**
 * AURALYN — Voice Intake Bridge
 *
 * Connects Twilio Voice (phone call) to the AdaptiveDialogueEngine.
 *
 * Flow:
 *   1. Patient calls clinic number
 *   2. Twilio hits POST /api/voice/intake/incoming
 *   3. We start a dialogue session, speak the first question
 *   4. Patient speaks — Twilio transcribes via <Gather>
 *   5. Twilio hits POST /api/voice/intake/respond
 *   6. We run through AdaptiveDialogueEngine, speak the next question
 *   7. Loop until complete — then generate physician briefing card
 *
 * File: server/routes/voiceIntake.ts
 *
 * Register in server/index.ts:
 *   import voiceIntakeRouter from "./routes/voiceIntake";
 *   app.use("/api/voice/intake", voiceIntakeRouter);
 *
 * Twilio console: Your number → Voice webhook → POST https://yourdomain.com/api/voice/intake/incoming
 */

import { Router }  from "express";
import twilio      from "twilio";
import { db }      from "../db";
import { sql }     from "drizzle-orm";
import { logger }  from "../utils/logger";
import {
  startSession,
  processResponse,
  generatePhysicianBriefing,
} from "../dialogue/AdaptiveDialogueEngine";
import { appendAuditEvent } from "../governance/audit";

const router      = Router();
const VoiceResponse = twilio.twiml.VoiceResponse;
const POLLY_VOICE   = "Polly.Joanna-Neural";

// Validate Twilio webhook signatures (skip in development)
const twilioValidator = process.env.NODE_ENV === "production"
  ? twilio.webhook({ validate: true })
  : (_req: any, _res: any, next: any) => next();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cleanForSpeech(text: string): string {
  return text
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/\[.*?\]/g, "")
    .replace(/\(e\.g\.[^)]*\)/g, "")
    .replace(/0-10/g, "zero to ten")
    .replace(/RLQ|LLQ|RUQ|LUQ/g, "your abdomen")
    .replace(/\n+/g, " ")
    .trim();
}

function speakAndGather(twiml: InstanceType<typeof VoiceResponse>, text: string, actionUrl: string) {
  twiml.say({ voice: POLLY_VOICE, language: "en-US" }, cleanForSpeech(text));
  const gather = twiml.gather({
    input:        ["speech"] as any,
    action:       actionUrl,
    method:       "POST",
    speechTimeout: "auto",
    speechModel:  "phone_call",
    enhanced:     true,
    language:     "en-US",
    timeout:      8,
  });
  gather.pause({ length: 1 });
  twiml.say({ voice: POLLY_VOICE }, "I didn't catch that. Please say your answer when you're ready.");
  twiml.redirect(actionUrl);
}

// ─── Incoming call ────────────────────────────────────────────────────────────

router.post("/incoming", twilioValidator, async (req, res) => {
  const callSid    = req.body.CallSid    as string;
  const fromNumber = req.body.From       as string;
  const complaintId    = "sore_throat";    // Default; real apps look up by caller or IVR selection
  const chiefComplaint = "general symptoms";

  try {
    // Create dialogue session
    const encounterId = crypto.randomUUID();
    const patientId   = crypto.randomUUID();

    const { sessionId, firstPrompt } = await startSession({
      encounterId,
      patientId,
      complaintId,
      chiefComplaint,
      channel: "voice_phone",
    });

    // Store callSid → sessionId mapping
    await db.execute(sql`
      INSERT INTO voice_call_sessions (call_sid, session_id, encounter_id)
      VALUES (${callSid}, ${sessionId}::uuid, ${encounterId}::uuid)
      ON CONFLICT (call_sid) DO NOTHING
    `);

    await appendAuditEvent({
      tenantId:   "system",
      actorId:    fromNumber,
      action:     "VOICE_INTAKE_STARTED",
      entityType: "dialogue_session",
      entityId:   sessionId,
      payload:    { callSid, encounterId },
    });

    const twiml = new VoiceResponse();
    twiml.say({ voice: POLLY_VOICE, language: "en-US" },
      "Thank you for calling Auralyn Health. I will ask you a few quick questions about how you're feeling today to help prepare your care team."
    );
    speakAndGather(twiml, firstPrompt, `/api/voice/intake/respond?sid=${sessionId}`);

    res.type("text/xml").send(twiml.toString());
  } catch (err: any) {
    logger.error("[VoiceIntake] incoming error", { error: err?.message, callSid });
    const twiml = new VoiceResponse();
    twiml.say({ voice: POLLY_VOICE }, "I'm sorry, something went wrong. Please call us back or visit the front desk.");
    twiml.hangup();
    res.type("text/xml").send(twiml.toString());
  }
});

// ─── Patient spoke — process answer, advance dialogue ────────────────────────

router.post("/respond", twilioValidator, async (req, res) => {
  const sessionId = req.query.sid as string;
  const timedOut  = req.query.timeout === "true";
  const spokenText = timedOut ? "[no response]" : (req.body.SpeechResult ?? "");
  const confidence = parseFloat(req.body.Confidence ?? "0");

  const twiml = new VoiceResponse();

  if (!sessionId) {
    twiml.say({ voice: POLLY_VOICE }, "I'm sorry, I lost track of your session. Please call us back.");
    twiml.hangup();
    return res.type("text/xml").send(twiml.toString());
  }

  try {
    // Log low-confidence transcriptions for review
    if (confidence < 0.6 && spokenText && spokenText !== "[no response]") {
      await appendAuditEvent({
        tenantId:   "system",
        actorId:    null,
        action:     "VOICE_LOW_CONFIDENCE_TRANSCRIPTION",
        entityType: "dialogue_session",
        entityId:   sessionId,
        payload:    { spokenText, confidence },
      }).catch(() => {});
    }

    const result = await processResponse(sessionId, spokenText);

    // Safety alert — transfer to front desk immediately
    if (result.safetyAlert) {
      twiml.say({ voice: POLLY_VOICE },
        "What you've described needs immediate attention. I'm connecting you to our staff right now. Please stay on the line."
      );
      const frontDesk = process.env.CLINIC_FRONT_DESK_NUMBER;
      if (frontDesk) {
        twiml.dial(frontDesk);
      } else {
        twiml.say({ voice: POLLY_VOICE }, "Please call 9-1-1 or go to the nearest emergency room immediately.");
        twiml.hangup();
      }
      return res.type("text/xml").send(twiml.toString());
    }

    if (result.isComplete) {
      // Generate briefing card asynchronously
      generatePhysicianBriefing(sessionId).catch(err =>
        logger.warn("[VoiceIntake] Briefing generation failed", { error: err?.message })
      );

      twiml.say({ voice: POLLY_VOICE },
        (result.triageSummary?.keyMessage ?? "Thank you for answering those questions.") + " " +
        "Your information has been sent to your care team. Please let the front desk know you have completed the questionnaire."
      );
      twiml.hangup();
    } else {
      speakAndGather(
        twiml,
        result.nextPrompt ?? "Could you tell me a bit more?",
        `/api/voice/intake/respond?sid=${sessionId}`
      );
    }
  } catch (err: any) {
    logger.error("[VoiceIntake] respond error", { error: err?.message, sessionId });
    twiml.say({ voice: POLLY_VOICE }, "I'm sorry, something went wrong. Your care team has been alerted. Please check in at the front desk.");
    twiml.hangup();
  }

  res.type("text/xml").send(twiml.toString());
});

// ─── Language selection IVR ───────────────────────────────────────────────────

router.post("/language-select", twilioValidator, (_req, res) => {
  const twiml = new VoiceResponse();
  twiml.say({ voice: POLLY_VOICE, language: "en-US" }, "For English, press 1 or say English.");
  twiml.say({ voice: "Polly.Lupe-Neural", language: "es-US" }, "Para español, oprima 2 o diga español.");
  twiml.gather({
    input:      ["speech", "dtmf"] as any,
    action:     "/api/voice/intake/language-chosen",
    numDigits:  1,
    timeout:    5,
    language:   "en-US",
  });
  res.type("text/xml").send(twiml.toString());
});

export default router;
