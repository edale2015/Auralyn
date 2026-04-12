/**
 * Alert Engine — real-time clinical alerts via WebSocket + SMS (Twilio)
 * Broadcasts to all connected dashboard clients + escalates critical via SMS.
 */

import { broadcastPatientUpdate } from "../realtime/patientStream";
import { sendSMS }               from "../services/smsService";

export type AlertLevel = "info" | "warning" | "high" | "critical";

export interface ClinicalAlert {
  id:        string;
  message:   string;
  level:     AlertLevel;
  patientId?:string;
  source:    string;
  timestamp: string;
  smsResult?:{ sent: boolean; sid?: string };
}

// In-memory alert ring buffer (last 200)
const alertLog: ClinicalAlert[] = [];
const MAX_ALERTS = 200;

function alertId(): string {
  return `ALT-${Date.now()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
}

// Critical SMS recipients — configure via env (comma-separated phone numbers)
function getCriticalRecipients(): string[] {
  const raw = process.env.ALERT_SMS_RECIPIENTS ?? "";
  return raw.split(",").map((n) => n.trim()).filter(Boolean);
}

export async function sendAlert(
  message:   string,
  level:     AlertLevel,
  patientId?: string,
  source?:   string
): Promise<ClinicalAlert> {
  const alert: ClinicalAlert = {
    id:        alertId(),
    message,
    level,
    patientId,
    source:    source ?? "system",
    timestamp: new Date().toISOString(),
  };

  // ── WebSocket broadcast → Control Tower dashboard ─────────────────────────
  broadcastPatientUpdate({
    type:     "CLINICAL_ALERT",
    alert,
  });

  // ── Twilio SMS for critical-level only ────────────────────────────────────
  if (level === "critical") {
    const recipients = getCriticalRecipients();
    if (recipients.length > 0) {
      const smsBody = `🚨 CRITICAL ALERT | ${source ?? "Auralyn"}: ${message}`;
      try {
        const smsResults = await Promise.allSettled(
          recipients.map((to) => sendSMS(to, smsBody))
        );
        const firstSuccess = smsResults.find(
          (r) => r.status === "fulfilled" && r.value.success
        ) as PromiseFulfilledResult<any> | undefined;
        alert.smsResult = { sent: !!firstSuccess, sid: firstSuccess?.value?.sid };
      } catch {
        alert.smsResult = { sent: false };
      }
    } else {
      // Log even without recipients so it's traceable
      console.warn(`[AlertEngine] CRITICAL — no SMS recipients configured: ${message}`);
      alert.smsResult = { sent: false };
    }
  }

  // ── Audit ring buffer ─────────────────────────────────────────────────────
  if (alertLog.length >= MAX_ALERTS) alertLog.shift();
  alertLog.push(alert);

  console.log(`[AlertEngine][${level.toUpperCase()}] ${message}`);
  return alert;
}

export function getAlertLog(): ClinicalAlert[] {
  return [...alertLog];
}

export function getCriticalAlerts(): ClinicalAlert[] {
  return alertLog.filter((a) => a.level === "critical");
}
