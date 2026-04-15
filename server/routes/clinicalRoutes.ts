import express from "express";
import twilio   from "twilio";
import { requireRole } from "../middleware/requireRole";
import { runFullClinicalFlow, getFlowLog, getOrchestratorMetrics } from "../orchestrator/clinicalOrchestrator";
import { sendSMS, sendWhatsApp, parseSMSIntent } from "../services/smsService";
import { createOrUpsertSession } from "../patient/sessionStorePg";
import { createTraceId } from "../audit/auditLogger";
import { handleSMSCommand } from "../chat/botCommandHandler";
import { ENV } from "../config/env";

const router = express.Router();

router.post("/run", requireRole(["admin", "physician", "staff"]), async (req, res) => {
  const { complaint, answers, patientId, channel } = req.body;
  if (!complaint) return res.status(400).json({ error: "complaint is required" });
  const result = await runFullClinicalFlow({ complaint, answers: answers || {}, patientId, channel });
  res.json(result);
});

router.get("/log", requireRole(["admin", "physician"]), (req, res) => {
  const limit = Number(req.query.limit) || 50;
  res.json(getFlowLog(limit));
});

router.get("/metrics", requireRole(["admin"]), (_req, res) => {
  res.json(getOrchestratorMetrics());
});

router.post("/sms/send", requireRole(["admin", "physician", "staff"]), async (req, res) => {
  const { to, body } = req.body;
  if (!to || !body) return res.status(400).json({ error: "to and body are required" });
  const result = await sendSMS(to, body);
  res.json(result);
});

router.post("/sms/whatsapp", requireRole(["admin", "physician", "staff"]), async (req, res) => {
  const { to, body } = req.body;
  if (!to || !body) return res.status(400).json({ error: "to and body are required" });
  const result = await sendWhatsApp(to, body);
  res.json(result);
});

router.post("/sms/parse-intent", requireRole(["admin", "physician", "staff"]), (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: "text required" });
  res.json(parseSMSIntent(text));
});

router.post("/sms/webhook", express.urlencoded({ extended: false }), async (req, res) => {
  // Phase 3 Fix: Validate Twilio webhook signature before processing any payload.
  // Without this, any internet client can forge inbound SMS payloads and inject
  // arbitrary clinical data into the triage pipeline as if it came from a patient.
  const authToken = ENV.TWILIO_AUTH_TOKEN;
  if (authToken) {
    const signature = req.headers["x-twilio-signature"] as string;
    const webhookUrl =
      (process.env.PUBLIC_URL ?? `https://${req.headers.host}`) +
      "/api/clinical/sms/webhook";
    const valid = twilio.validateRequest(authToken, signature, webhookUrl, req.body);
    if (!valid) {
      console.warn("[SMS Webhook] Invalid Twilio signature — request rejected");
      res.status(403).send("Invalid Twilio signature");
      return;
    }
  } else {
    // No auth token configured — log a warning so ops teams are aware in dev/staging
    console.warn("[SMS Webhook] TWILIO_AUTH_TOKEN not set — signature validation skipped (dev mode)");
  }

  const incoming = (req.body.Body ?? "").trim();
  const from = req.body.From ?? "unknown";

  if (!incoming) {
    res.sendStatus(200);
    return;
  }

  const traceId = createTraceId();
  const patientId = from.replace(/\W/g, "_");

  const smsCommand = await handleSMSCommand(incoming).catch(() => null);
  if (smsCommand) {
    await sendSMS(from, smsCommand).catch(() => {});
    res.sendStatus(200);
    return;
  }

  try {
    const result = await runFullClinicalFlow({
      complaint: incoming,
      answers: {},
      patientId,
      channel: "sms",  // Phase 3 Fix: was incorrectly set to "web"
    });

    await createOrUpsertSession({
      id: patientId,
      status: (result as any)?.blocked ? "blocked" : "pending_review",
      riskLevel: (result as any)?.safetyGate?.level ?? "LOW",
      safetyFlags: (result as any)?.safetyGate?.reasons ?? [],
      disposition: result,
    });

    const replyText =
      (result as any)?.explanation?.summary ??
      (result as any)?.message ??
      "Your case has been received. A clinician will review it shortly.";

    await sendSMS(from, replyText);

    console.log(JSON.stringify({
      event: "sms_triage",
      from,
      patientId,
      traceId,
      status: (result as any)?.blocked ? "blocked" : "ok",
    }));
  } catch (e: any) {
    console.error("[SMS Webhook] Error:", e?.message);
    await sendSMS(from, "We received your message and a clinician will review your case shortly.").catch(() => {});
  }

  res.sendStatus(200);
});

export default router;
