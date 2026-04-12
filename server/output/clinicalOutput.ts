/**
 * Consistent Output Engine
 * Enforces ONE diagnosis path, ONE disposition, NO over-treatment.
 * "Same patient should not get 10 different treatments."
 */

import type { ClinicalTokenSet } from "../core/clinicalTokens";

export interface ClinicalOutput {
  disposition:   string;
  diagnoses:     string[];
  primaryDx:     string;
  message:       string;
  urgency:       "routine" | "semi-urgent" | "urgent" | "emergent";
  followUp?:     string;
}

export function generateClinicalOutput(tokens: ClinicalTokenSet): ClinicalOutput {
  const diagnoses  = tokens.allowedDiagnoses.length ? tokens.allowedDiagnoses : Object.keys(tokens.posterior).slice(0, 1);
  const primaryDx  = diagnoses[0] ?? "unspecified";
  const urgency    = mapUrgency(tokens.riskLevel);
  const disposition= tokens.requiresPhysicianReview
    ? "physician_review_required"
    : determineDisposition(tokens);

  const followUp = buildFollowUp(tokens);

  return {
    disposition,
    diagnoses,
    primaryDx,
    message:  tokens.requiresPhysicianReview
      ? `Case flagged for physician review due to ${tokens.riskLevel} risk profile. Most likely: ${primaryDx}.`
      : `Most likely diagnosis: ${primaryDx.replace(/_/g, " ")}. ${generateMessage(tokens)}`,
    urgency,
    followUp,
  };
}

function determineDisposition(tokens: ClinicalTokenSet): string {
  switch (tokens.riskLevel) {
    case "critical": return "ER";
    case "high":     return "urgent_care";
    case "moderate": return "follow_up";
    case "low":
    default:         return "home_care";
  }
}

function mapUrgency(risk: ClinicalTokenSet["riskLevel"]): ClinicalOutput["urgency"] {
  const map: Record<ClinicalTokenSet["riskLevel"], ClinicalOutput["urgency"]> = {
    critical: "emergent",
    high:     "urgent",
    moderate: "semi-urgent",
    low:      "routine",
  };
  return map[risk];
}

function generateMessage(tokens: ClinicalTokenSet): string {
  if (tokens.riskLevel === "critical") return "Seek emergency care immediately.";
  if (tokens.riskLevel === "high")     return "Visit an urgent care clinic today.";
  if (tokens.riskLevel === "moderate") return "Schedule a follow-up within 24–48 hours.";
  return "Monitor symptoms. Return if condition worsens.";
}

function buildFollowUp(tokens: ClinicalTokenSet): string | undefined {
  if (tokens.riskLevel === "critical" || tokens.riskLevel === "high") return undefined;
  if (tokens.riskLevel === "moderate") return "Follow up in 24–48 hours or sooner if symptoms worsen.";
  return "Return to clinic if symptoms persist beyond 7 days.";
}
