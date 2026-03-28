/**
 * Mental Health Crisis Assessment — PHQ-9 + Suicide Risk (C-SSRS Simplified)
 *
 * PHQ-9 (Patient Health Questionnaire-9):
 *   Validated depression screen, sum of 9 items scored 0–3 each (0–27 total).
 *   Severity bands: 0–4 none, 5–9 mild, 10–14 moderate, 15–19 mod-severe, 20–27 severe.
 *   Item 9 ("thoughts of self-harm") = any positive answer → mandatory risk assessment.
 *
 * C-SSRS Simplified (Columbia Suicide Severity Rating Scale):
 *   Ideation severity types:
 *     1 = passive ("I wish I were dead")
 *     2 = active non-specific ("I want to kill myself")
 *     3 = active with method in mind
 *     4 = active with intent (but no plan)
 *     5 = active with intent and plan
 *   Any type 3+ = HIGH RISK → ER_NOW.
 *
 * References:
 *   - Kroenke K, JGIM 2001 (PHQ-9); Posner K, Am J Psychiatry 2011 (C-SSRS)
 */

export interface Phq9Input {
  items: number[]; // Array of 9 scores, each 0–3 (0=not at all, 3=nearly every day)
}

export interface Phq9Result {
  totalScore:  number;
  severity:    "none" | "mild" | "moderate" | "moderate-severe" | "severe";
  item9:       number;  // self-harm item
  flaggedForRisk: boolean;
  recommendation: string;
}

export type IdeationType = 0 | 1 | 2 | 3 | 4 | 5;

export interface SuicideRiskInput {
  suicidalIdeation:       boolean;
  ideationType?:          IdeationType;    // C-SSRS ideation type (0 = none)
  hasMethod?:             boolean;
  hasIntent?:             boolean;
  hasPlan?:               boolean;
  priorAttempt?:          boolean;
  substanceIntoxicated?:  boolean;
  meansByAccess?:         boolean;         // access to lethal means (e.g., firearms)
  socialSupport?:         "none" | "limited" | "moderate" | "strong";
  phq9Score?:             number;
}

export type SuicideRiskLevel = "none" | "low" | "moderate" | "high" | "imminent";

export interface SuicideRiskResult {
  highRisk:     boolean;
  riskLevel:    SuicideRiskLevel;
  disposition:  "ER_NOW" | "URGENT_24H" | "MONITOR" | "ROUTINE";
  factors:      string[];
  rationale:    string;
  safetyPlan:   boolean;  // whether a safety plan should be initiated
}

// ── PHQ-9 ────────────────────────────────────────────────────────────────────

export function PHQ9(input: Phq9Input): Phq9Result {
  const scores = input.items.slice(0, 9).map((s) => Math.max(0, Math.min(3, s)));
  const totalScore = scores.reduce((a, b) => a + b, 0);
  const item9 = scores[8] ?? 0;

  let severity: Phq9Result["severity"] = "none";
  let recommendation = "Routine follow-up";
  if (totalScore >= 20) { severity = "severe"; recommendation = "Immediate psychiatric evaluation"; }
  else if (totalScore >= 15) { severity = "moderate-severe"; recommendation = "Same-day mental health referral"; }
  else if (totalScore >= 10) { severity = "moderate"; recommendation = "Mental health consultation within 1 week"; }
  else if (totalScore >= 5)  { severity = "mild";     recommendation = "Watchful waiting, return if symptoms worsen"; }

  return { totalScore, severity, item9, flaggedForRisk: item9 > 0, recommendation };
}

export function PHQ9FromScore(score: number): Pick<Phq9Result, "severity" | "recommendation"> {
  if (score >= 20) return { severity: "severe",          recommendation: "Immediate psychiatric evaluation" };
  if (score >= 15) return { severity: "moderate-severe", recommendation: "Same-day mental health referral" };
  if (score >= 10) return { severity: "moderate",        recommendation: "Mental health consultation within 1 week" };
  if (score >= 5)  return { severity: "mild",            recommendation: "Watchful waiting" };
  return { severity: "none", recommendation: "Routine follow-up" };
}

// ── Suicide Risk (C-SSRS Simplified) ─────────────────────────────────────────

export function suicideRisk(input: SuicideRiskInput): SuicideRiskResult {
  const factors: string[] = [];
  let riskLevel: SuicideRiskLevel = "none";

  if (!input.suicidalIdeation && !input.hasPlan && !input.hasIntent) {
    return {
      highRisk:    false,
      riskLevel:   "none",
      disposition: "ROUTINE",
      factors:     [],
      rationale:   "No suicidal ideation reported",
      safetyPlan:  false,
    };
  }

  // Ideation type (C-SSRS)
  const type = input.ideationType ?? (input.suicidalIdeation ? 2 : 0);
  if (type >= 5) { riskLevel = "imminent"; factors.push("Active ideation with intent and plan"); }
  else if (type >= 4) { riskLevel = "high"; factors.push("Active ideation with intent"); }
  else if (type >= 3) { riskLevel = "high"; factors.push("Active ideation with method"); }
  else if (type >= 2) { riskLevel = "moderate"; factors.push("Active non-specific ideation"); }
  else if (type >= 1) { riskLevel = "low"; factors.push("Passive ideation"); }

  // Escalating factors
  if (input.hasMethod)           { riskLevel = "high"; factors.push("Method identified"); }
  if (input.hasIntent)           { riskLevel = "high"; factors.push("Intent present"); }
  if (input.hasPlan)             { riskLevel = "imminent"; factors.push("Concrete plan formed"); }
  if (input.priorAttempt)        { riskLevel = "high"; factors.push("Prior attempt history"); }
  if (input.substanceIntoxicated){ factors.push("Current substance intoxication"); }
  if (input.meansByAccess)       { riskLevel = "high"; factors.push("Access to lethal means"); }
  if (input.socialSupport === "none") factors.push("No social support");
  if ((input.phq9Score ?? 0) >= 20) factors.push("PHQ-9 severe (≥20)");

  const highRisk = riskLevel === "high" || riskLevel === "imminent";

  const disposition: SuicideRiskResult["disposition"] =
    riskLevel === "imminent" ? "ER_NOW"
    : riskLevel === "high"   ? "ER_NOW"
    : riskLevel === "moderate" ? "URGENT_24H"
    : "MONITOR";

  return {
    highRisk,
    riskLevel,
    disposition,
    factors,
    rationale: `C-SSRS type ${type}, risk level: ${riskLevel} — ${factors.join("; ")}`,
    safetyPlan: riskLevel !== "none",
  };
}
