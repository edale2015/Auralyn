import express from "express";
import { handleChatIntake } from "../channels/chatIntakeEngine";
import { channelConfig } from "../channels/channelConfig";
import { sendPhysicianAlert } from "../alerts/physicianAlertService";
import { handlePhysicianReply, listPendingAlerts } from "../alerts/alertResponseHandler";
import { auditLog } from "../security/auditLogger";

export const telegramPatientRouter = express.Router();

function verifyPatientSecret(req: express.Request): boolean {
  const secret = channelConfig.telegram.patientWebhookSecret || channelConfig.telegram.webhookSecret;
  if (!secret) return true;
  const headerSecret = req.headers["x-telegram-bot-api-secret-token"] as string | undefined;
  const pathSecret = (req.params as any).secret;
  return headerSecret === secret || pathSecret === secret;
}

function extractTelegramMedia(msg: any): { imageUrl?: string; audioUrl?: string } {
  let imageUrl: string | undefined;
  let audioUrl: string | undefined;

  if (msg.photo?.length) {
    const fileId = msg.photo[msg.photo.length - 1].file_id;
    imageUrl = `https://api.telegram.org/file/bot${channelConfig.telegram.botToken}/${fileId}`;
  }

  if (msg.voice?.file_id) {
    audioUrl = `https://api.telegram.org/voice/bot${channelConfig.telegram.botToken}/${msg.voice.file_id}`;
  }

  if (msg.document?.mime_type?.startsWith("image/")) {
    imageUrl = `https://api.telegram.org/file/bot${channelConfig.telegram.botToken}/${msg.document.file_id}`;
  }

  return { imageUrl, audioUrl };
}

async function sendTelegramReply(chatId: string, text: string): Promise<void> {
  const token = channelConfig.telegram.botToken;
  if (!token) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
  } catch (err: any) {
    console.error("[TelegramPatient] send error:", err.message);
  }
}

telegramPatientRouter.post("/patient/:secret", async (req, res) => {
  res.json({ ok: true });

  try {
    if (!verifyPatientSecret(req)) {
      auditLog({ actor: "telegram_patient_webhook", action: "forbidden_secret", details: {} });
      return;
    }

    const update = req.body;
    const message = update?.message;
    if (!message?.chat?.id) return;

    const chatId = String(message.chat.id);
    const { imageUrl, audioUrl } = extractTelegramMedia(message);

    const reply = await handleChatIntake({
      channel: "telegram",
      externalUserId: chatId,
      externalMessageId: String(message.message_id ?? ""),
      text: message.text,
      imageUrl,
      audioUrl,
      timestamp: Date.now(),
      raw: update,
    });

    await sendTelegramReply(chatId, reply.text);

    if (reply.escalate) {
      await sendPhysicianAlert({
        type: "patient_escalation",
        channel: "telegram",
        patientExternalUserId: chatId,
        caseId: `tg-${chatId}-${Date.now()}`,
        summary: reply.escalationReason ?? "physician_review",
        priority: reply.escalationReason === "emergency_911" ? "immediate" : "urgent",
      });
    }
  } catch (err: any) {
    console.error("[TelegramPatient] webhook error:", err.message);
  }
});

telegramPatientRouter.post("/physician-reply", async (req, res) => {
  try {
    const { caseId, text, replyFromChatId } = req.body;
    if (!caseId || !text) return res.status(400).json({ ok: false, error: "caseId and text required" });

    const result = await handlePhysicianReply(text, caseId);
    if (replyFromChatId) {
      await sendTelegramReply(String(replyFromChatId), result.message);
    }
    res.json({ ok: true, result });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

telegramPatientRouter.get("/pending-alerts", (_req, res) => {
  res.json({ ok: true, alerts: listPendingAlerts() });
});
