/**
 * MY ADDITION: Emergency Contact Escalation Manager
 *
 * When ER_NOW fires and the physician doesn't review within the timeout window,
 * the system must escalate to emergency contacts. This module generates
 * templated WhatsApp/SMS messages for emergency contact notification.
 *
 * This is the communication half of the physician checkpoint — the checkpoint
 * creates the approval record; this module handles patient-facing notification
 * when that approval stalls.
 *
 * HIPAA note: Emergency contact notifications are permitted under
 * 45 CFR §164.510(b) — Use and Disclosure for Facility Directories and
 * Next of Kin — without explicit patient authorization in emergencies.
 */

import { DispositionTier } from "./hardStopRules";
import { logger }          from "../utils/logger";
import { emitEvent }       from "../controlTower/eventBus";

export interface EmergencyContactRecord {
  contactId:        string;
  sessionId:        string;  // hashed — no PHI
  contactChannel:   "whatsapp" | "sms";
  contactHashedId:  string;  // hashed contact identifier — no raw numbers
  relationship:     "emergency_contact" | "caregiver" | "physician";
}

export interface EscalationMessage {
  to:           EmergencyContactRecord;
  subject:      string;
  body:         string;
  urgency:      "critical" | "high";
  triggeredBy:  string;  // e.g., "physician_review_timeout"
  caseRef:      string;  // caseId — not PHI (opaque UUID)
  generatedAt:  string;
}

const ESCALATION_TEMPLATES: Record<DispositionTier, string> = {
  [DispositionTier.CALL_911]: `⚠️ EMERGENCY ALERT

Someone you care for has used an AI triage service and received an URGENT recommendation.

They have been advised to call 911 immediately.

If you are with them or can reach them now, please help them get emergency assistance right away.

🆔 Case Reference: {caseRef}
⏰ Assessed: {timestamp}

This message was sent automatically because emergency physician review was delayed. This is not a substitute for calling 911 directly.`,

  [DispositionTier.ER_NOW]: `⚠️ EMERGENCY ALERT

Someone you care for has used an AI triage service and received a recommendation to go to the Emergency Room immediately.

Please check on them and help them reach emergency care if needed.

🆔 Case Reference: {caseRef}
⏰ Assessed: {timestamp}

A physician was notified and is reviewing this case. Call 911 if their condition is worsening.`,

  [DispositionTier.ER_URGENT]:      "Non-emergency escalation — see {caseRef}",
  [DispositionTier.URGENT_CARE]:    "Non-emergency escalation — see {caseRef}",
  [DispositionTier.TELEHEALTH_NOW]: "Non-emergency escalation — see {caseRef}",
  [DispositionTier.NEXT_DAY]:       "Non-emergency escalation — see {caseRef}",
  [DispositionTier.ROUTINE]:        "Non-emergency escalation — see {caseRef}",
  [DispositionTier.SELF_CARE]:      "Non-emergency escalation — see {caseRef}",
};

/**
 * Generate an emergency contact escalation message.
 * Only generates for ER_NOW and CALL_911 dispositions.
 */
export function generateEscalationMessage(params: {
  caseRef:     string;
  disposition: DispositionTier;
  contact:     EmergencyContactRecord;
  triggeredBy: string;
}): EscalationMessage | null {
  const isEmergencyTier = [DispositionTier.CALL_911, DispositionTier.ER_NOW].includes(params.disposition);
  if (!isEmergencyTier) return null;

  const template = ESCALATION_TEMPLATES[params.disposition] ?? ESCALATION_TEMPLATES[DispositionTier.ER_NOW];
  const timestamp = new Date().toISOString();

  const body = template
    .replace("{caseRef}", params.caseRef)
    .replace("{timestamp}", new Date().toLocaleString("en-US", { timeZone: "UTC", dateStyle: "medium", timeStyle: "short" }));

  const message: EscalationMessage = {
    to:          params.contact,
    subject:     params.disposition === DispositionTier.CALL_911 ? "EMERGENCY: Call 911 Required" : "Emergency Room Visit Required",
    body,
    urgency:     params.disposition === DispositionTier.CALL_911 ? "critical" : "high",
    triggeredBy: params.triggeredBy,
    caseRef:     params.caseRef,
    generatedAt: timestamp,
  };

  emitEvent({
    type:    "EMERGENCY_CONTACT_ESCALATION",
    payload: {
      caseRef:      params.caseRef,
      disposition:  params.disposition,
      triggeredBy:  params.triggeredBy,
      contactType:  params.contact.relationship,
    },
    timestamp: Date.now(),
  });

  logger.warn("emergency_contact_escalation_generated", {
    caseRef:     params.caseRef,
    disposition: params.disposition,
    triggeredBy: params.triggeredBy,
    urgency:     message.urgency,
  });

  return message;
}

/**
 * Generate escalation messages for all registered contacts of a case.
 * Returns all generated messages ready for channel dispatch.
 */
export function escalateToAllContacts(params: {
  caseRef:     string;
  disposition: DispositionTier;
  contacts:    EmergencyContactRecord[];
  triggeredBy: string;
}): EscalationMessage[] {
  return params.contacts
    .map(contact => generateEscalationMessage({ ...params, contact }))
    .filter((m): m is EscalationMessage => m !== null);
}
