import { ENV } from "../config/env";

interface SMSResult {
  success: boolean;
  sid?: string;
  error?: string;
}

function getTwilioClient() {
  if (!ENV.TWILIO_SID || !ENV.TWILIO_AUTH_TOKEN) {
    return null;
  }
  try {
    const twilio = require("twilio");
    return twilio(ENV.TWILIO_SID, ENV.TWILIO_AUTH_TOKEN);
  } catch {
    return null;
  }
}

export async function sendSMS(to: string, body: string): Promise<SMSResult> {
  const client = getTwilioClient();
  if (!client) {
    console.warn("[SMS] Twilio not configured — message not sent:", { to, body: body.slice(0, 50) });
    return { success: false, error: "Twilio not configured" };
  }
  if (!ENV.TWILIO_NUMBER) {
    return { success: false, error: "TWILIO_FROM_NUMBER not set" };
  }

  try {
    const msg = await client.messages.create({
      to,
      from: ENV.TWILIO_NUMBER,
      body,
    });
    return { success: true, sid: msg.sid };
  } catch (err: any) {
    console.error("[SMS] Send failed:", err.message);
    return { success: false, error: err.message };
  }
}

export async function sendWhatsApp(to: string, body: string): Promise<SMSResult> {
  const client = getTwilioClient();
  if (!client) {
    return { success: false, error: "Twilio not configured" };
  }
  const from = ENV.TWILIO_WHATSAPP || `whatsapp:${ENV.TWILIO_NUMBER}`;
  const toWA = to.startsWith("whatsapp:") ? to : `whatsapp:${to}`;

  try {
    const msg = await client.messages.create({ to: toWA, from, body });
    return { success: true, sid: msg.sid };
  } catch (err: any) {
    console.error("[WhatsApp] Send failed:", err.message);
    return { success: false, error: err.message };
  }
}

export function parseSMSIntent(body: string): { intent: string; keywords: string[] } {
  const lower = body.toLowerCase().trim();
  const keywords: string[] = [];

  if (lower.includes("snap") || lower.includes("food")) keywords.push("snap");
  if (lower.includes("medicaid") || lower.includes("health")) keywords.push("medicaid");
  if (lower.includes("housing") || lower.includes("rent")) keywords.push("housing");
  if (lower.includes("job") || lower.includes("unemploy")) keywords.push("unemployment");
  if (lower.includes("status")) keywords.push("status");
  if (lower.includes("help")) keywords.push("general");

  const intent = keywords[0] ?? "general";
  return { intent, keywords };
}
