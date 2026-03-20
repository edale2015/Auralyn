import { Router } from "express";
import { randomUUID } from "crypto";
import { processMessage, sendReply } from "../channels";
import { type MessageEvent } from "../channels/messageEvent";
import {
  addMessage,
  caseIdFromChannel,
  ensureConversation,
  setLastResult,
} from "../integrations/conversationStore";
import { addPatientMessage, addSystemMessage } from "../assistant/telemedicineSessionService";

const router = Router();

// Twilio sends x-www-form-urlencoded: From=whatsapp:+1234...&Body=text
router.post("/whatsapp/webhook", async (req, res) => {
  // Respond immediately — Twilio requires acknowledgement within 15 seconds
  res.status(200).set("Content-Type", "text/xml").send("<Response></Response>");

  try {
    const rawFrom: string = String(req.body?.From ?? "").trim();
    const text: string = String(req.body?.Body ?? "").trim();
    const messageSid: string = String(req.body?.MessageSid ?? randomUUID());

    if (!rawFrom || !text) return;

    const externalUserId = rawFrom.replace(/^whatsapp:/, "");

    // Build MessageEvent for the main conversation orchestrator (Sheets-driven, full pipeline)
    const event: MessageEvent = {
      channel: "whatsapp",
      externalUserId,
      chatId: externalUserId,
      text,
      timestamp: new Date().toISOString(),
      messageId: messageSid,
      rawSignatureVerified: true,
      media: [],
    };

    // Route through the full clinical conversation orchestrator
    // This uses Sheets-loaded questions, red-flag rules, and sends replies back to the patient
    const result = await processMessage(event);

    // Send replies to the patient via Twilio WhatsApp
    for (const reply of result.replies) {
      await sendReply(`whatsapp:${externalUserId}`, reply).catch((e: any) =>
        console.error("[WhatsApp] sendReply error:", e?.message)
      );
    }

    // Also maintain the telemedicine doctor-review thread for physician oversight
    const caseId = caseIdFromChannel("whatsapp", externalUserId);
    ensureConversation(caseId, "whatsapp", externalUserId);
    addPatientMessage(caseId, text);

    if (result.replies.length > 0) {
      const summary = result.replies.join("\n---\n");
      addMessage(caseId, "assistant", summary, "whatsapp");
      addSystemMessage(caseId, `AI response sent — ${new Date().toLocaleTimeString()}`);
      setLastResult(caseId, result);
    }

    console.log(
      `[WhatsApp] caseId=${caseId} replies=${result.replies.length} staffCmd=${result.isStaffCommand} dedup=${result.dedupSkipped}`
    );
  } catch (err: any) {
    console.error("[WhatsApp] Webhook error:", err?.message ?? err);
  }
});

// Twilio GET verification
router.get("/whatsapp/webhook", (_req, res) => {
  res.status(200).send("OK");
});

export default router;
