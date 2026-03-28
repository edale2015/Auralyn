import twilio from "twilio";
import { ENV } from "../config/env";

let twilioClient: ReturnType<typeof twilio> | null = null;

function getClient() {
  if (!twilioClient && ENV.TWILIO_SID && ENV.TWILIO_AUTH_TOKEN) {
    twilioClient = twilio(ENV.TWILIO_SID, ENV.TWILIO_AUTH_TOKEN);
  }
  return twilioClient;
}

export interface AlertPayload {
  level: "critical" | "high" | "warning" | "info";
  type: string;
  message: string;
  caseId?: string;
  timestamp?: number;
}

const dispatchLog: Array<AlertPayload & { sentAt: number; channel: string }> = [];

/**
 * Send an SMS to the configured ALERT_PHONE number.
 * Silently skips if Twilio credentials or ALERT_PHONE are not configured.
 */
export async function sendSMS(payload: AlertPayload): Promise<void> {
  const alertPhone = process.env.ALERT_PHONE;
  const fromPhone  = ENV.TWILIO_NUMBER;
  const client     = getClient();

  if (!client || !alertPhone || !fromPhone) {
    console.log(`[AlertDispatcher] SMS skipped (not configured): ${payload.message}`);
    return;
  }

  const body = `🚨 [${payload.level.toUpperCase()}] ${payload.type}\n${payload.message}${payload.caseId ? `\nCase: ${payload.caseId}` : ""}`;
  try {
    await client.messages.create({ body, from: fromPhone, to: alertPhone });
    dispatchLog.push({ ...payload, sentAt: Date.now(), channel: "sms" });
    console.log(`[AlertDispatcher] SMS sent to ${alertPhone}: ${payload.type}`);
  } catch (err: any) {
    console.warn(`[AlertDispatcher] SMS failed: ${err?.message}`);
  }
}

/**
 * Dispatch alerts for critical safety blocks or engine degradation.
 * Only fires for level=critical to avoid noise.
 */
export async function dispatchAlert(payload: AlertPayload): Promise<void> {
  const entry = { ...payload, sentAt: Date.now(), channel: "log" };
  dispatchLog.push(entry);
  console.log(`[AlertDispatcher][${payload.level.toUpperCase()}] ${payload.type}: ${payload.message}`);

  if (payload.level === "critical") {
    await sendSMS(payload);
  }
}

export function getDispatchLog(limit = 50) {
  return dispatchLog.slice(-limit).reverse();
}
