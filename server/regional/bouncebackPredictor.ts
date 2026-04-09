/**
 * Bounceback Predictor — 72-hour return risk
 *
 * Predicts whether a patient discharged today will return to the ER within
 * 72 hours — one of the key quality metrics for urgent care operations.
 *
 * High bounceback risk triggers a 12-hour SMS follow-up. This closes the
 * care loop and often prevents the bounce before it happens.
 *
 * Common bounceback patterns in NYC urgent care:
 *   - Abdominal pain discharged without imaging
 *   - Elderly patients with vague complaints
 *   - Headache in high-risk patients
 *   - Missed diagnoses in high-volume shifts
 *
 * Score thresholds:
 *   0–1  → low   (no follow-up needed)
 *   2–3  → medium (24h SMS check-in)
 *   4+   → high  (12h phone or SMS)
 */

export interface BouncebackInput {
  patientId?:         string;
  complaint?:         string;
  ageYears?:          number;
  priorVisits30Days?: number;   // number of ED/UC visits in last 30 days
  symptoms?:          string[];
  dischargeCondition?: "improved" | "stable" | "unchanged" | "worsened";
}

export interface BouncebackResult {
  score:        number;
  risk:         "low" | "medium" | "high";
  needsFollowup: boolean;
  followupWindow: "none" | "12h" | "24h" | "48h";
  reason:       string;
}

export function predictBounceback(p: BouncebackInput): BouncebackResult {
  let score = 0;
  const reasons: string[] = [];

  // Complaint-based risk
  if (p.complaint === "abdominal_pain")     { score += 2; reasons.push("abdominal pain — imaging often missed"); }
  if (p.complaint === "headache")           { score += 1; reasons.push("headache — secondary cause possible"); }
  if (p.complaint === "chest_pain")         { score += 1; reasons.push("chest pain — ACS exclusion incomplete"); }
  if (p.complaint === "dizziness")          { score += 1; reasons.push("dizziness — fall risk + vestibular"); }
  if (p.complaint === "back_pain")          { score += 1; reasons.push("back pain — structural cause possible"); }

  // Age
  if ((p.ageYears ?? 0) > 70) { score += 2; reasons.push("age > 70 — limited reserve"); }
  else if ((p.ageYears ?? 0) > 60) { score += 1; reasons.push("age > 60 — elevated complication risk"); }

  // Prior visit pattern (frequent flier pattern is a strong bounceback predictor)
  if ((p.priorVisits30Days ?? 0) >= 2) { score += 2; reasons.push(`${p.priorVisits30Days} prior visits in 30 days`); }

  // Discharge condition
  if (p.dischargeCondition === "unchanged") { score += 1; reasons.push("discharged unchanged"); }
  if (p.dischargeCondition === "worsened")  { score += 3; reasons.push("discharged while worsening"); }

  const risk: BouncebackResult["risk"] =
    score >= 4 ? "high"   :
    score >= 2 ? "medium" : "low";

  const followupWindow: BouncebackResult["followupWindow"] =
    risk === "high"   ? "12h" :
    risk === "medium" ? "24h" : "none";

  return {
    score,
    risk,
    needsFollowup:  risk !== "low",
    followupWindow,
    reason: reasons.length > 0 ? reasons.join("; ") : "no elevated bounceback risk factors",
  };
}
