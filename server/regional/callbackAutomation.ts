/**
 * Callback Automation
 *
 * Builds a structured follow-up plan for each patient based on their
 * admission risk and bounceback predictor scores.
 *
 * Callback hierarchy:
 *   1. High admission risk → 2h phone call (patient may need to come back now)
 *   2. High bounceback risk → 12h SMS (catch deterioration before bounce)
 *   3. Medium bounceback risk → 24h SMS (standard post-discharge check)
 *   4. Otherwise → no proactive callback needed
 *
 * The message template is pre-filled with the reason so the outreach
 * channel can send a personalized, clinically appropriate message.
 */

import { type AdmissionRiskResult }  from "./admissionRisk";
import { type BouncebackResult }     from "./bouncebackPredictor";

export interface CallbackInput {
  patient:        { patientId?: string };
  admissionRisk:  AdmissionRiskResult;
  bouncebackRisk: BouncebackResult;
}

export interface CallbackPlan {
  timing:          "none" | "2h" | "12h" | "24h" | "48h";
  method:          "phone" | "sms" | "none";
  reason:          string;
  messageTemplate: string;
  priority:        "urgent" | "routine" | "none";
}

export function buildCallbackPlan(input: CallbackInput): CallbackPlan {
  const { admissionRisk, bouncebackRisk } = input;

  // Highest priority: patient at high admission risk — call immediately
  if (admissionRisk.risk === "high") {
    return {
      timing:  "2h",
      method:  "phone",
      reason:  `High admission risk (score ${admissionRisk.score}) — ${admissionRisk.contributingFactors.slice(0, 2).join(", ")}`,
      messageTemplate:
        "Hi, this is Auralyn calling to check on you. Your recent visit flagged some concerns we want to follow up on. Are you feeling okay? Please call us back immediately at [number] or go to the nearest ER if symptoms have worsened.",
      priority: "urgent",
    };
  }

  // High bounceback risk → same-day SMS
  if (bouncebackRisk.risk === "high") {
    return {
      timing:  "12h",
      method:  "sms",
      reason:  `High bounceback risk (score ${bouncebackRisk.score}) — ${bouncebackRisk.reason}`,
      messageTemplate:
        "Hi [name], just checking in after your visit today. How are you feeling? Reply with your current symptoms or call us if anything has changed. We want to make sure you're on the right track.",
      priority: "urgent",
    };
  }

  // Medium bounceback risk → next-day SMS
  if (bouncebackRisk.risk === "medium") {
    return {
      timing:  "24h",
      method:  "sms",
      reason:  `Medium bounceback risk (score ${bouncebackRisk.score}) — ${bouncebackRisk.reason}`,
      messageTemplate:
        "Hi [name], this is Auralyn. We hope you're feeling better after yesterday's visit. If symptoms return or worsen, please don't wait — reach out or go to urgent care.",
      priority: "routine",
    };
  }

  // No elevated risk
  return {
    timing:          "none",
    method:          "none",
    reason:          "No elevated admission or bounceback risk",
    messageTemplate: "",
    priority:        "none",
  };
}
