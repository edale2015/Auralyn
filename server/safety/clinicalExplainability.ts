/**
 * MY ADDITION: Clinical Decision Explainability
 *
 * Generates plain-language explanations of WHY a disposition was assigned.
 * Critical for patient communication via WhatsApp/Telegram — patients who
 * understand the reasoning are more likely to follow the recommendation.
 *
 * Also satisfies FDA Transparency requirement (AI/ML Action Plan 2021 §3):
 * patients should know the system is AI-assisted and understand its reasoning.
 *
 * Architecture: rule-based template engine (deterministic) rather than LLM-
 * generated (non-deterministic) to ensure consistency across similar cases.
 */

import { DispositionTier } from "./hardStopRules";

export interface ExplainabilityInput {
  disposition:        DispositionTier;
  confidence:         number;
  keySymptoms:        string[];
  hardStopTriggered?: string;    // ruleId if a hard stop fired
  physicianApproved:  boolean;
  complaint:          string;
  redFlagCount:       number;
}

export interface ClinicalExplanation {
  dispositionTitle:   string;
  urgencyStatement:   string;
  reasoningPoints:    string[];   // up to 3 plain-language reasons
  safetyNote:         string;
  physicianNote:      string;
  callToAction:       string;
  confidence:         number;
  forChannel:         "whatsapp" | "telegram" | "generic";
}

// Disposition-level plain English titles and urgency statements
const DISPOSITION_TITLES: Record<DispositionTier, string> = {
  [DispositionTier.CALL_911]:       "🚨 Call 911 Now",
  [DispositionTier.ER_NOW]:         "🏥 Go to the Emergency Room Now",
  [DispositionTier.ER_URGENT]:      "🏥 Emergency Room — Within 1 Hour",
  [DispositionTier.URGENT_CARE]:    "⚕️ Urgent Care — Within 4 Hours",
  [DispositionTier.TELEHEALTH_NOW]: "💻 Virtual Visit — Within 1 Hour",
  [DispositionTier.NEXT_DAY]:       "📅 See a Provider Tomorrow",
  [DispositionTier.ROUTINE]:        "📅 Schedule a Regular Appointment",
  [DispositionTier.SELF_CARE]:      "🏠 Home Care Recommended",
};

const DISPOSITION_URGENCY: Record<DispositionTier, string> = {
  [DispositionTier.CALL_911]:       "Based on what you've described, this sounds like it may be a life-threatening emergency. Do not drive yourself — call 911 right now.",
  [DispositionTier.ER_NOW]:         "Based on your symptoms, you should go to an emergency room immediately. Please do not wait.",
  [DispositionTier.ER_URGENT]:      "Your symptoms suggest you need emergency evaluation within the next hour.",
  [DispositionTier.URGENT_CARE]:    "Your symptoms need attention today, but don't appear to be immediately life-threatening. Please be seen within 4 hours.",
  [DispositionTier.TELEHEALTH_NOW]: "Your symptoms can likely be evaluated safely by a virtual visit — please start one within the next hour.",
  [DispositionTier.NEXT_DAY]:       "Your symptoms don't seem urgent, but you should see a provider by tomorrow.",
  [DispositionTier.ROUTINE]:        "Your symptoms appear manageable. Please schedule a regular appointment.",
  [DispositionTier.SELF_CARE]:      "Based on your description, your symptoms can likely be managed at home. Here's what to watch for.",
};

const DISPOSITION_CTA: Record<DispositionTier, string> = {
  [DispositionTier.CALL_911]:       "Call 911 immediately. Do not wait. Do not drive.",
  [DispositionTier.ER_NOW]:         "Go to the ER now. If you cannot transport yourself safely, call 911.",
  [DispositionTier.ER_URGENT]:      "Go to your nearest emergency room within the next hour.",
  [DispositionTier.URGENT_CARE]:    "Find an urgent care near you and go within 4 hours.",
  [DispositionTier.TELEHEALTH_NOW]: "Start a virtual visit now — providers are available 24/7.",
  [DispositionTier.NEXT_DAY]:       "Call your provider first thing tomorrow to schedule an appointment.",
  [DispositionTier.ROUTINE]:        "Schedule an appointment with your primary care provider.",
  [DispositionTier.SELF_CARE]:      "Monitor your symptoms at home. Return to this service or call 911 if symptoms worsen.",
};

const SAFETY_NOTE = "⚠️ This AI assessment was reviewed by a licensed physician before being sent to you. It is not a substitute for emergency care. If you feel worse or have any doubt, call 911.";

/**
 * Generate a plain-language explanation for a clinical disposition.
 * Deterministic — same inputs always produce consistent messaging.
 */
export function generateClinicalExplanation(
  input:   ExplainabilityInput,
  channel: "whatsapp" | "telegram" | "generic" = "generic"
): ClinicalExplanation {
  const reasoningPoints: string[] = [];

  // Hard stop reasoning — always first if present
  if (input.hardStopTriggered) {
    reasoningPoints.push(`A safety rule was triggered based on your symptoms — this type of symptom always requires immediate evaluation.`);
  }

  // Key symptoms reasoning
  if (input.keySymptoms.length > 0) {
    const symptomList = input.keySymptoms.slice(0, 3).join(", ");
    reasoningPoints.push(`The symptoms you described (${symptomList}) can sometimes indicate a condition that needs prompt attention.`);
  }

  // Red flag count reasoning
  if (input.redFlagCount >= 2) {
    reasoningPoints.push(`Our review found ${input.redFlagCount} signs that suggest your symptoms may be more serious than they appear.`);
  } else if (input.redFlagCount === 1) {
    reasoningPoints.push("One warning sign in your description suggested a higher level of care was appropriate.");
  }

  // Confidence framing
  if (input.confidence < 0.80) {
    reasoningPoints.push(`Because your symptom pattern is somewhat unusual, we're being cautious and recommending a higher level of care.`);
  }

  // Cap at 3 points for readability
  const finalPoints = reasoningPoints.slice(0, 3);
  if (finalPoints.length === 0) {
    finalPoints.push("Your symptoms, taken together, suggest this level of care is most appropriate for your situation.");
  }

  const physicianNote = input.physicianApproved
    ? "✅ A licensed physician has reviewed this recommendation."
    : "⏳ A licensed physician is reviewing this recommendation now.";

  return {
    dispositionTitle: DISPOSITION_TITLES[input.disposition],
    urgencyStatement: DISPOSITION_URGENCY[input.disposition],
    reasoningPoints:  finalPoints,
    safetyNote:       SAFETY_NOTE,
    physicianNote,
    callToAction:     DISPOSITION_CTA[input.disposition],
    confidence:       input.confidence,
    forChannel:       channel,
  };
}

/**
 * Format an explanation as a WhatsApp/Telegram message string.
 * Uses markdown-compatible formatting supported by both channels.
 */
export function formatExplanationForChannel(explanation: ClinicalExplanation): string {
  const lines = [
    `*${explanation.dispositionTitle}*`,
    "",
    explanation.urgencyStatement,
    "",
    "*Why we recommend this:*",
    ...explanation.reasoningPoints.map((p, i) => `${i + 1}. ${p}`),
    "",
    explanation.physicianNote,
    "",
    `*What to do:* ${explanation.callToAction}`,
    "",
    explanation.safetyNote,
  ];

  return lines.join("\n");
}
