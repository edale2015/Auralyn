import express from "express";
import { handleChatIntake } from "../channels/chatIntakeEngine";
import { sendWhatsAppMetaMessage } from "../channels/whatsappClient";
import { channelConfig } from "../channels/channelConfig";
import { sendPhysicianAlert } from "../alerts/physicianAlertService";
import { handlePhysicianReply } from "../alerts/alertResponseHandler";
import { auditLog } from "../security/auditLogger";

export const whatsappMetaRouter = express.Router();

function extractWhatsAppMedia(msg: any): { imageUrl?: string; audioUrl?: string } {
  let imageUrl: string | undefined;
  let audioUrl: string | undefined;
  if (msg.type === "image") imageUrl = msg.image?.id ?? undefined;
  if (msg.type === "audio") audioUrl = msg.audio?.id ?? undefined;
  return { imageUrl, audioUrl };
}

whatsappMetaRouter.get("/meta/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === channelConfig.whatsapp.verifyToken) {
    return res.status(200).send(challenge);
  }

  auditLog({ actor: "whatsapp_meta_webhook", action: "verify_failed", details: { mode, token } });
  return res.sendStatus(403);
});

whatsappMetaRouter.post("/meta/webhook", async (req, res) => {
  res.json({ ok: true });

  try {
    const entry = req.body?.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const msg = value?.messages?.[0];
    if (!msg?.from) return;

    const from = String(msg.from);
    const text: string = msg.type === "text" ? (msg.text?.body ?? "") : "";
    const { imageUrl, audioUrl } = extractWhatsAppMedia(msg);

    const reply = await handleChatIntake({
      channel: "whatsapp",
      externalUserId: from,
      externalMessageId: String(msg.id ?? ""),
      text,
      imageUrl,
      audioUrl,
      timestamp: Date.now(),
      raw: req.body,
    });

    await sendWhatsAppMetaMessage(from, reply.text);

    if (reply.escalate) {
      await sendPhysicianAlert({
        type: "patient_escalation",
        channel: "whatsapp",
        patientExternalUserId: from,
        caseId: `wa-${from}-${Date.now()}`,
        summary: reply.escalationReason ?? "physician_review",
        priority: reply.escalationReason === "emergency_911" ? "immediate" : "urgent",
      });
    }
  } catch (err: any) {
    console.error("[WhatsAppMeta] webhook error:", err.message);
  }
});

whatsappMetaRouter.post("/meta/physician-reply", async (req, res) => {
  try {
    const { caseId, text, replyTo } = req.body;
    if (!caseId || !text) return res.status(400).json({ ok: false, error: "caseId and text required" });

    const result = await handlePhysicianReply(text, caseId);

    if (replyTo) {
      await sendWhatsAppMetaMessage(String(replyTo), result.message);
    }

    res.json({ ok: true, result });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});
