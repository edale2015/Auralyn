import { sendSMS } from "../services/smsService";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { shouldSendAlert } from "./redisDeduper";

export type AlertPayload = {
  patientId: string;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  reasons: string[];
  traceId?: string;
};

export async function notifyOnCallPhysician(
  payload: AlertPayload
): Promise<{ sent: boolean; reason?: string }> {
  if (payload.riskLevel !== "HIGH") {
    return { sent: false, reason: "not_high" };
  }

  const dedupKey = `${payload.patientId}|${payload.riskLevel}|${payload.reasons.join("|")}`;
  if (!(await shouldSendAlert(dedupKey))) {
    console.log("[Notifier] Alert deduped for patient:", payload.patientId);
    return { sent: false, reason: "deduped" };
  }

  const to = process.env.ON_CALL_PHYSICIAN_NUMBER;
  if (!to) {
    console.warn("[Notifier] ON_CALL_PHYSICIAN_NUMBER not set — alert not sent");
    return { sent: false, reason: "missing_on_call_number" };
  }

  const body =
    `[HIGH RISK ALERT]\n` +
    `Patient: ${payload.patientId}\n` +
    `Risk: ${payload.riskLevel}\n` +
    `Reasons: ${payload.reasons.join(", ")}\n` +
    (payload.traceId ? `Trace: ${payload.traceId}` : "");

  const smsResult = await sendSMS(to, body);

  try {
    await db.execute(sql`
      INSERT INTO alert_logs (patient_id, risk_level, reasons, channel, trace_id)
      VALUES (
        ${payload.patientId},
        ${payload.riskLevel},
        ${JSON.stringify(payload.reasons)}::jsonb,
        ${"sms"},
        ${payload.traceId ?? null}
      )
    `);
  } catch (e: any) {
    console.error("[Notifier] Failed to persist alert log:", e?.message);
  }

  console.log(JSON.stringify({
    event: "high_risk_alert",
    patientId: payload.patientId,
    riskLevel: payload.riskLevel,
    traceId: payload.traceId,
    smsSent: smsResult.success,
  }));

  return { sent: smsResult.success, reason: smsResult.success ? undefined : smsResult.error };
}
