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
import { handleWhatsAppKBIntake } from "../whatsapp/kbIntake";

const router = Router();

function buildWebhookUrl(req: any): string {
  // Behind Cloud Run / GFE, req.protocol is always "http" (internal).
  // Twilio signs using the public HTTPS URL, so we must reconstruct from
  // x-forwarded-proto and x-forwarded-host (set by Google Frontend).
  const proto =
    (req.headers["x-forwarded-proto"] as string | undefined)?.split(",")[0].trim() ??
    req.protocol;
  const host =
    (req.headers["x-forwarded-host"] as string | undefined)?.split(",")[0].trim() ??
    req.get("host");
  return `${proto}://${host}${req.originalUrl}`;
}

const TWILIO_SANDBOX_NUMBER = "+14155238886";

function validateTwilioSignature(req: any): boolean {
  // ── Skip validation when explicitly disabled (sandbox / dev mode) ──
  if (process.env.TWILIO_SKIP_VALIDATION === "true") {
    console.log("[WhatsApp] ⚠️  TWILIO_SKIP_VALIDATION=true — signature check bypassed");
    return true;
  }

  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    console.warn("[WhatsApp] TWILIO_AUTH_TOKEN not set — skipping signature validation (INSECURE)");
    return true;
  }

  const twilioSignature = req.headers["x-twilio-signature"] as string | undefined;
  const params: Record<string, string> = req.body ?? {};

  // ── Skip validation for Twilio sandbox number ──
  const fromParam = String(params["From"] ?? "").replace(/^whatsapp:/, "");
  if (fromParam === TWILIO_SANDBOX_NUMBER) {
    console.log("[WhatsApp] Sandbox number detected — skipping strict HMAC validation");
    return true;
  }

  // ── Debug: log all headers + reconstructed URL on every request ──
  const url = buildWebhookUrl(req);
  console.log("[WhatsApp] Incoming POST headers:", JSON.stringify({
    "x-twilio-signature": twilioSignature ?? "(missing)",
    "x-forwarded-proto":  req.headers["x-forwarded-proto"] ?? "(missing)",
    "x-forwarded-host":   req.headers["x-forwarded-host"]  ?? "(missing)",
    "host":               req.get("host"),
    "content-type":       req.headers["content-type"],
  }));
  console.log("[WhatsApp] Reconstructed URL for HMAC:", url);
  console.log("[WhatsApp] Body params received:", JSON.stringify(params));

  if (!twilioSignature) {
    console.error("[WhatsApp] ⛔ Missing X-Twilio-Signature header — rejecting request");
    return false;
  }

  const sortedKeys = Object.keys(params).sort();
  const paramString = sortedKeys.map(k => `${k}${params[k]}`).join("");
  const stringToSign = url + paramString;

  console.log("[WhatsApp] String-to-sign (first 120 chars):", stringToSign.slice(0, 120));

  const expectedSig = createHmac("sha1", authToken)
    .update(stringToSign, "utf8")
    .digest("base64");

  console.log("[WhatsApp] Expected sig:", expectedSig, "| Received sig:", twilioSignature);

  try {
    const expected = Buffer.from(expectedSig);
    const received = Buffer.from(twilioSignature);
    if (expected.length !== received.length) {
      console.error("[WhatsApp] ⛔ Signature length mismatch — expected", expected.length, "got", received.length);
      return false;
    }
    return timingSafeEqual(expected, received);
  } catch {
    return false;
  }
}

router.post("/whatsapp/webhook", async (req, res) => {
  // NOTE: Real-time messages are handled by the early handler in server/index.ts
  // (registered before globalSafetyGate). This fallback runs only if that
  // handler is bypassed (direct router mount in tests, etc.).
  if (!validateTwilioSignature(req)) {
    console.error("[WhatsApp] ⛔ Signature validation FAILED — rejecting.");
    return res.status(403).send("Forbidden");
  }

  res.status(200).set("Content-Type", "text/xml").send("<Response></Response>");

  try {
    const rawFrom: string = String(req.body?.From ?? "").trim();
    const text: string = String(req.body?.Body ?? "").trim();
    const messageSid: string = String(req.body?.MessageSid ?? randomUUID());

    if (!rawFrom || !text) return;

    const externalUserId = rawFrom.replace(/^whatsapp:/, "");

    const kbHandled = await handleWhatsAppKBIntake({ from: rawFrom, text, messageSid }).catch((e: any) => {
      console.error("[WhatsApp KB] Error:", e?.message);
      return false;
    });

    if (kbHandled) {
      console.log(`[WhatsApp KB] caseId=n/a handled=true from=${rawFrom}`);
      return;
    }

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
  /* eslint-enable no-unreachable */
});

router.get("/whatsapp/webhook", (_req, res) => {
  res.status(200).send("OK");
});

export default router;
