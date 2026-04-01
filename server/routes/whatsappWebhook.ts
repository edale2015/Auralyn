import { Router } from "express";
import { createHmac, timingSafeEqual } from "crypto";
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

function validateTwilioSignature(req: any): boolean {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    console.warn("[WhatsApp] TWILIO_AUTH_TOKEN not set — skipping signature validation (INSECURE)");
    return true;
  }

  const twilioSignature = req.headers["x-twilio-signature"] as string | undefined;
  if (!twilioSignature) {
    console.error("[WhatsApp] ⛔ Missing X-Twilio-Signature header — rejecting request");
    return false;
  }

  const url = `${req.protocol}://${req.get("host")}${req.originalUrl}`;
  const params: Record<string, string> = req.body ?? {};

  const sortedKeys = Object.keys(params).sort();
  const paramString = sortedKeys.map(k => `${k}${params[k]}`).join("");
  const stringToSign = url + paramString;

  const expectedSig = createHmac("sha1", authToken)
    .update(stringToSign, "utf8")
    .digest("base64");

  try {
    const expected = Buffer.from(expectedSig);
    const received = Buffer.from(twilioSignature);
    if (expected.length !== received.length) return false;
    return timingSafeEqual(expected, received);
  } catch {
    return false;
  }
}

router.post("/whatsapp/webhook", async (req, res) => {
  if (!validateTwilioSignature(req)) {
    console.error("[WhatsApp] ⛔ Signature validation FAILED — possible spoofed request. Rejecting.");
    return res.status(403).send("Forbidden");
  }

  res.status(200).set("Content-Type", "text/xml").send("<Response></Response>");

  try {
    const rawFrom: string = String(req.body?.From ?? "").trim();
    const text: string = String(req.body?.Body ?? "").trim();
    const messageSid: string = String(req.body?.MessageSid ?? randomUUID());

    if (!rawFrom || !text) return;

    const externalUserId = rawFrom.replace(/^whatsapp:/, "");

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

    const result = await processMessage(event);

    for (const reply of result.replies) {
      await sendReply(`whatsapp:${externalUserId}`, reply).catch((e: any) =>
        console.error("[WhatsApp] sendReply error:", e?.message)
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

    console.log(
      `[WhatsApp] caseId=${caseId} replies=${result.replies.length} staffCmd=${result.isStaffCommand} dedup=${result.dedupSkipped}`
    );
  } catch (err: any) {
    console.error("[WhatsApp] Webhook error:", err?.message ?? err);
  }
});

router.get("/whatsapp/webhook", (_req, res) => {
  res.status(200).send("OK");
});

export default router;
