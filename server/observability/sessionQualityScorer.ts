/**
 * MY ADDITION: Intake Session Quality Scorer
 *
 * Scores the quality of an intake conversation before it enters the debate engine.
 * Low-quality intakes (incomplete information) lead to:
 *   1. Lower model confidence → more false positives/negatives
 *   2. Red Team flagging extraction gaps that don't exist (noise)
 *   3. Physician overrides due to ambiguity (not AI error)
 *
 * Quality scoring enables:
 *   - Routing low-quality intakes to physician review directly
 *   - Sending clarifying questions before debate
 *   - Weighting RLHF signals (low quality intake = down-weight the outcome)
 *
 * Score: 0–100. Below 50 = flagged for clarification. Below 30 = physician direct.
 */

import { logger } from "../utils/logger";

export interface SessionQualityInput {
  rawText:          string;
  extractedSymptoms: string[];
  symptomOnsetPresent: boolean;
  durationPresent:   boolean;
  severityRated:     boolean;       // did patient give a severity / pain score?
  ageProvided:       boolean;
  genderProvided:    boolean;
  medicationsProvided: boolean;
  wordCount:         number;
  clarifyingQuestionsAnswered: number;
  clarifyingQuestionsAsked:    number;
}

export interface SessionQualityScore {
  score:           number;      // 0–100
  grade:           "excellent" | "good" | "acceptable" | "poor" | "insufficient";
  flags:           string[];    // which dimensions are weak
  recommendation:  "proceed" | "request_clarification" | "physician_direct";
  dimensions:      SessionQualityDimensions;
  rlhfWeightMultiplier: number; // 0.3–1.0 — down-weight poor-quality intakes in RLHF
}

export interface SessionQualityDimensions {
  completeness:    number;   // 0–25: symptoms + onset + duration + severity
  context:         number;   // 0–25: age + gender + medications
  clarity:         number;   // 0–25: word count + symptom specificity
  engagement:      number;   // 0–25: clarifying questions answered
}

const GRADE_THRESHOLDS = {
  excellent:    85,
  good:         70,
  acceptable:   50,
  poor:         30,
};

export function scoreSessionQuality(input: SessionQualityInput): SessionQualityScore {
  const flags: string[] = [];

  // ── Completeness (0–25) ──────────────────────────────────────────────────
  let completeness = 0;
  if (input.extractedSymptoms.length >= 1) completeness += 8;
  if (input.extractedSymptoms.length >= 3) completeness += 4;
  if (input.symptomOnsetPresent)           completeness += 6;
  if (input.durationPresent)               completeness += 4;
  if (input.severityRated)                 completeness += 3;

  if (input.extractedSymptoms.length === 0) flags.push("No symptoms extracted from intake text");
  if (!input.symptomOnsetPresent)           flags.push("Symptom onset not mentioned");
  if (!input.durationPresent)              flags.push("Duration not mentioned");
  if (!input.severityRated)                flags.push("Severity not rated by patient");

  // ── Context (0–25) ───────────────────────────────────────────────────────
  let context = 0;
  if (input.ageProvided)         context += 12;
  if (input.genderProvided)      context += 8;
  if (input.medicationsProvided) context += 5;

  if (!input.ageProvided)   flags.push("Age not provided — affects thresholds for fever, chest pain");
  if (!input.genderProvided) flags.push("Gender not provided — affects differential diagnosis");

  // ── Clarity (0–25) ───────────────────────────────────────────────────────
  let clarity = 0;
  const normalizedWordCount = Math.min(input.wordCount / 50, 1.0);   // 50+ words = full score
  clarity += Math.round(normalizedWordCount * 15);
  if (input.extractedSymptoms.length >= 2) clarity += 10;

  if (input.wordCount < 15) flags.push("Very short response — insufficient information for confident assessment");
  if (input.wordCount < 5)  flags.push("Response too short to process");

  // ── Engagement (0–25) ───────────────────────────────────────────────────
  let engagement = 0;
  const answeredRate = input.clarifyingQuestionsAsked > 0
    ? input.clarifyingQuestionsAnswered / input.clarifyingQuestionsAsked
    : 1.0;
  engagement = Math.round(answeredRate * 25);

  if (answeredRate < 0.5) flags.push("Patient answered fewer than half the clarifying questions");

  const score = completeness + context + clarity + engagement;

  const grade: SessionQualityScore["grade"] =
    score >= GRADE_THRESHOLDS.excellent    ? "excellent" :
    score >= GRADE_THRESHOLDS.good         ? "good" :
    score >= GRADE_THRESHOLDS.acceptable   ? "acceptable" :
    score >= GRADE_THRESHOLDS.poor         ? "poor" :
    "insufficient";

  const recommendation: SessionQualityScore["recommendation"] =
    score < 30 ? "physician_direct" :
    score < 50 ? "request_clarification" :
    "proceed";

  // RLHF down-weighting: poor quality intakes produce noisy training signals
  const rlhfWeightMultiplier =
    score >= 85 ? 1.0 :
    score >= 70 ? 0.9 :
    score >= 50 ? 0.7 :
    score >= 30 ? 0.5 :
    0.3;

  logger.info("session_quality_scored", {
    score, grade, recommendation, flagCount: flags.length,
    completeness, context, clarity, engagement, rlhfWeightMultiplier,
  });

  return {
    score,
    grade,
    flags,
    recommendation,
    dimensions: { completeness, context, clarity, engagement },
    rlhfWeightMultiplier,
  };
}

export function qualityThresholdCheck(score: number): {
  proceed: boolean;
  blockReason?: string;
} {
  if (score < 10) {
    return { proceed: false, blockReason: "Intake quality too low to generate a reliable assessment (score < 10)" };
  }
  return { proceed: true };
}
