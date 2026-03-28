import express from "express";
import { processVoiceInput } from "./processVoice";
import { getCallCenterStats } from "./callCenter";
import { auditLog } from "../security/auditLogger";
import { startSession } from "./voiceSessionStore";

const router = express.Router();

router.post("/incoming", (req, res) => {
  const callSid = req.body?.CallSid ?? `call-${Date.now()}`;
  const from = req.body?.From ?? "unknown";

  auditLog({ actor: "voice_webhook", action: "call_incoming", entityType: "call", entityId: callSid, details: { from } });
  startSession(callSid, from);

  res.type("text/xml");
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Welcome to the clinical triage assistant. I will ask you a few questions to help assess your condition.</Say>
  <Gather input="speech" action="/api/voice/process" method="POST" timeout="8" speechTimeout="3">
    <Say voice="alice">Please briefly describe your main problem or symptoms.</Say>
  </Gather>
  <Say voice="alice">We didn't receive a response. Please call back when ready. Goodbye.</Say>
  <Hangup />
</Response>`);
});

router.post("/process", async (req, res) => {
  const callSid = req.body?.CallSid ?? `call-${Date.now()}`;
  const speechResult = req.body?.SpeechResult ?? "";

  try {
    const { twiml } = await processVoiceInput(callSid, speechResult);
    res.type("text/xml");
    res.send(`<?xml version="1.0" encoding="UTF-8"?>${twiml}`);
  } catch (err: any) {
    auditLog({ actor: "voice_webhook", action: "process_error", entityType: "call", entityId: callSid, details: { error: err.message } });
    res.type("text/xml");
    res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>We encountered an error. Please call back or seek care directly. Goodbye.</Say>
  <Hangup />
</Response>`);
  }
});

router.get("/stats", (_req, res) => {
  res.json({ ok: true, stats: getCallCenterStats() });
});

export default router;
