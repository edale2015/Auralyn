// Universal clinic emergency protocol.
//
// A STAFF-FACING alert system, independent of every triage flow. It is triggered
// when a staff member (dashboard button / dedicated number) or a patient reports
// an observation consistent with a life-threatening emergency. When triggered it:
//   - formats the full ABCs response protocol,
//   - sends it to the physician's WhatsApp immediately,
//   - appends an audit-chain event with a timestamp.
//
// It NEVER sends anything to the patient — the caller decides what (if anything)
// the patient is told. The patient-WhatsApp bypass in kbIntake.ts sends the
// patient a separate "call 911" message and then calls triggerEmergencyProtocol.
//
// CLINICAL CONTENT: the ABCs / "consider while waiting" block below is a
// physician-authored static template. It is NOT generated and NOT inferred by
// any model. It must be reviewed and signed off by the supervising physician
// before production use (it contains specific interventions, e.g. NS 500 mL
// bolus, O2 thresholds). Do not edit the clinical wording without physician
// approval.
//
// PHI/BAA: the observation text is forwarded to the physician's WhatsApp via
// Twilio. That is a PHI transfer to an external provider — see COMPLIANCE_TODO.md
// items 1 (BAA) and 2 (physician auth). This module does not log the observation.

import { sendWhatsAppMessage } from "../whatsapp/send";
import { appendAuditEvent } from "../audit/hashChain";

export type EmergencySource = "staff_dashboard" | "staff_text" | "patient_whatsapp";

export interface EmergencyTriggerInput {
  /** Free-text observation entered by staff or the raw patient message. */
  observation: string;
  source:      EmergencySource;
  /** Where the patient is, e.g. "Waiting room". Defaults per source. */
  location?:   string;
  /** Case/thread id for the audit trace, when one exists. */
  traceId?:    string;
}

export interface EmergencyTriggerResult {
  alertText:         string;   // the formatted staff alert (for dashboard display)
  physicianNotified: boolean;  // true if the WhatsApp alert was sent
  at:                string;   // ISO timestamp of the trigger
}

// The patient message sent (by the caller) when a patient's own WhatsApp text
// trips the emergency bypass. Verbatim, physician-approved wording.
export const EMERGENCY_BYPASS_PATIENT_MESSAGE =
  "This sounds like a medical emergency. Call 911 immediately or have someone " +
  "call for you. Do not drive yourself. Stay on the line with 911. " +
  "Our team has been alerted. — Auralyn";

// Patient-WhatsApp phrases that bypass all triage and fire the staff alert.
// Matched case-insensitively as substrings; apostrophe-optional variants are
// included so "I cant breathe" matches too.
const EMERGENCY_BYPASS_PHRASES: string[] = [
  "i can't breathe", "i cant breathe",
  "i'm passing out", "im passing out", "passing out",
  "i collapsed", "collapsed",
  "there is blood everywhere", "blood everywhere",
  "i'm having a seizure", "im having a seizure", "having a seizure",
  "i can't see", "i cant see",
  "i think i'm dying", "i think im dying",
  "someone help",
  "call 911", "call 9 1 1",
  "i'm unconscious", "im unconscious", "unconscious",
];

/** True if the patient text contains an emergency-bypass phrase. */
export function matchesEmergencyBypass(text: string): boolean {
  const lower = (text || "").toLowerCase();
  return EMERGENCY_BYPASS_PHRASES.some((p) => lower.includes(p));
}

function defaultLocation(source: EmergencySource): string {
  switch (source) {
    case "patient_whatsapp": return "Remote — reported via patient WhatsApp";
    default:                 return "Waiting room / Exam room / Entrance";
  }
}

/**
 * Format the full staff-facing emergency alert. Physician-authored static
 * template — see the CLINICAL CONTENT note at the top of this file.
 */
export function formatEmergencyAlert(args: {
  observation: string;
  location:    string;
  at:          string;
}): string {
  return [
    "🚨 CLINIC EMERGENCY ALERT",
    "",
    `Patient Status: ${args.observation}`,
    `Time: ${args.at}`,
    `Location: ${args.location}`,
    "",
    "IMMEDIATE ACTIONS:",
    "1. CALL 911 NOW if not already done",
    "2. Send someone to meet EMS at entrance",
    "3. Do not move patient unless in immediate danger",
    "",
    "WHILE WAITING FOR EMS — START ABCs:",
    "A — AIRWAY: Is airway open?",
    "    Position patient, jaw thrust if needed",
    "B — BREATHING: Is patient breathing?",
    "    Count respirations. O2 via nasal cannula if available. Pulse ox.",
    "C — CIRCULATION: Check pulse.",
    "    Control any active bleeding with direct pressure.",
    "    Start IV access if trained staff available.",
    "",
    "CONSIDER WHILE WAITING:",
    "□ IV fluids — NS 500ml bolus if hypotensive or diaphoretic",
    "□ EKG — if chest pain, palpitations, or syncope",
    "□ Fingerstick glucose — if altered mental status",
    "□ Pain medication — hold until physician present",
    "□ Oxygen — apply if SpO2 < 95%",
    "□ Position — lay flat if hypotensive, sit up if SOB",
    "",
    "DO NOT:",
    "- Give anything by mouth",
    "- Leave patient alone",
    "- Delay EMS call to gather more information",
    "",
    "EMS IS ON THE WAY. Stay with patient.",
    "Keep patient calm and still.",
    "— Auralyn Emergency Protocol",
  ].join("\n");
}

/**
 * Fire the emergency protocol: build the staff alert, send it to the physician's
 * WhatsApp, and append an audit event. Returns the alert text (for the
 * dashboard) and whether the physician was notified.
 *
 * Independent of all triage state — it reads no session and blocks no
 * conversation. Send/audit failures are caught so one channel failing never
 * suppresses the other.
 */
export async function triggerEmergencyProtocol(
  input: EmergencyTriggerInput,
): Promise<EmergencyTriggerResult> {
  const at        = new Date().toISOString();
  const location  = input.location ?? defaultLocation(input.source);
  const alertText = formatEmergencyAlert({ observation: input.observation, location, at });

  // 1) Notify the physician over WhatsApp.
  let physicianNotified = false;
  const physicianPhone = process.env.PHYSICIAN_PHONE_NUMBER;
  if (!physicianPhone) {
    console.warn("[Emergency] PHYSICIAN_PHONE_NUMBER not set — staff alert not delivered");
  } else {
    try {
      await sendWhatsAppMessage(physicianPhone, alertText);
      physicianNotified = true;
      console.log(`[Emergency] staff alert sent to physician (source=${input.source}, notified=true)`);
    } catch (e: any) {
      console.error(`[Emergency] failed to send staff alert: ${e?.message ?? e}`);
    }
  }

  // 2) Audit through the canonical hash chain. The observation (clinical free
  //    text) goes in `input` (the regulated record); metadata stays PHI-free.
  try {
    await appendAuditEvent({
      traceId: input.traceId ?? `emergency_${at}`,
      step:    "clinic_emergency_alert",
      input:   { observation: input.observation, source: input.source, location },
      output:  { physicianNotified, at },
      metadata: {
        source: input.source,
        location,
        intendedUse: "clinical_decision_support_only",
      },
    });
  } catch (e: any) {
    console.error(`[Emergency] AUDIT FAILED for clinic_emergency_alert: ${e?.message ?? e}`);
  }

  return { alertText, physicianNotified, at };
}
