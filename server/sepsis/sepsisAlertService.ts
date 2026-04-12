/**
 * Sepsis Alert Service — broadcasts SEPSIS_ALERT when probability ≥ 0.6
 * Integrates with WS broadcast, SMS alert, and audit log
 */

import { broadcastPatientUpdate } from "../realtime/patientStream";
import { sendSMS }                from "../services/smsService";
import { logEvent }               from "../ops/auditEvents";
import type { SepsisResult }      from "./sepsisEngine";

export interface SepsisAlert {
  type:       "SEPSIS_ALERT";
  patientId:  string;
  probability:number;
  priority:   "CRITICAL";
  factors:    string[];
  firedAt:    string;
}

const alertLog: SepsisAlert[] = [];

export async function triggerSepsisAlert(patient: { id: string }, sepsis: SepsisResult): Promise<SepsisAlert | null> {
  if (!sepsis.highRisk) return null;

  const alert: SepsisAlert = {
    type:       "SEPSIS_ALERT",
    patientId:  patient.id,
    probability: sepsis.probability,
    priority:   "CRITICAL",
    factors:    sepsis.factors,
    firedAt:    new Date().toISOString(),
  };

  // WS broadcast → all dashboards
  broadcastPatientUpdate({ type: "SEPSIS_ALERT", payload: alert });

  // SMS to on-call recipients
  const recipients = (process.env.ALERT_SMS_RECIPIENTS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (recipients.length > 0) {
    const msg = `🚨 SEPSIS ALERT — Patient ${patient.id} | P=${(sepsis.probability * 100).toFixed(0)}% | ${sepsis.factors[0] ?? ""}`;
    await Promise.allSettled(recipients.map((r) => sendSMS(r, msg)));
  }

  // Audit log
  logEvent({ actor: "sepsis_engine", action: "sepsis:alert_fired", entityType: "patient", entityId: patient.id, details: alert });

  if (alertLog.length >= 500) alertLog.shift();
  alertLog.push(alert);

  console.log(`[SepsisAlert] Patient ${patient.id} — prob=${(sepsis.probability * 100).toFixed(0)}%`);
  return alert;
}

export function getSepsisAlertLog(): SepsisAlert[] { return [...alertLog]; }
