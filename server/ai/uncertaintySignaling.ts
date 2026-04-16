/**
 * Uncertainty signaling — annotates grounded answers with a traffic-light
 * confidence signal before they are surfaced to clinicians.
 *
 * HIGH   (green)  — well supported, low hedge language, recent sources
 * MEDIUM (yellow) — partial support or moderate hedging
 * LOW    (red)    — insufficient support; physician verification mandatory
 */

import { GroundedAnswer } from "./clinicalRagGrounding";

export type UncertaintyLevel    = "HIGH" | "MEDIUM" | "LOW";
export type TrafficLightColor   = "green" | "yellow" | "red";

export interface UncertaintySignal {
  level:                UncertaintyLevel;
  color:                TrafficLightColor;
  label:                string;
  warningText:          string | null;
  annotatedAnswer:      string;
  confidenceScore:      number;
  hedgeWordsFound:      string[];
  needsPhysicianReview: boolean;
  sourceCount:          number;
}

const HEDGE_PHRASES = [
  "may be", "might be", "possibly", "unclear", "could be",
  "typically", "usually", "not explicitly stated",
  "cannot confirm", "unable to confirm", "no sufficiently relevant",
];

function detectHedgeWords(text: string): string[] {
  const lower = text.toLowerCase();
  return HEDGE_PHRASES.filter((p) => lower.includes(p));
}

function computeLevel(
  confidenceScore: number,
  hedgeWords:      string[],
  sourceCount:     number,
): UncertaintyLevel {
  const adjusted = confidenceScore - hedgeWords.length * 6 - (sourceCount === 0 ? 35 : 0);
  if (adjusted >= 70) return "HIGH";
  if (adjusted >= 45) return "MEDIUM";
  return "LOW";
}

type LevelConfig = {
  color:       TrafficLightColor;
  label:       string;
  warningText: string | null;
  prefix:      string | null;
};

const LEVEL_CONFIG: Record<UncertaintyLevel, LevelConfig> = {
  HIGH: {
    color:       "green",
    label:       "Grounded in knowledge base",
    warningText: null,
    prefix:      null,
  },
  MEDIUM: {
    color:       "yellow",
    label:       "Partially supported — review sources",
    warningText: "Moderate confidence. Review sources before clinical use.",
    prefix:      "⚠️ MODERATE CONFIDENCE: This answer is only partially supported by the knowledge base.",
  },
  LOW: {
    color:       "red",
    label:       "Low confidence — physician verification required",
    warningText: "Low confidence. Do not use clinically without physician review.",
    prefix:      "🚨 LOW CONFIDENCE: This answer is not adequately supported for clinical use without physician review.",
  },
};

/**
 * Annotate a grounded answer with an uncertainty signal.
 */
export function annotateWithUncertainty(groundedAnswer: GroundedAnswer): UncertaintySignal {
  const hedgeWordsFound = detectHedgeWords(groundedAnswer.answer);
  const sourceCount     = groundedAnswer.sources.length;
  const level           = computeLevel(groundedAnswer.confidenceScore, hedgeWordsFound, sourceCount);
  const config          = LEVEL_CONFIG[level];

  const annotatedAnswer = config.prefix
    ? `${config.prefix}\n\n---\n\n${groundedAnswer.answer}`
    : groundedAnswer.answer;

  return {
    level,
    color:                config.color,
    label:                config.label,
    warningText:          config.warningText,
    annotatedAnswer,
    confidenceScore:      groundedAnswer.confidenceScore,
    hedgeWordsFound,
    needsPhysicianReview: groundedAnswer.needsPhysicianReview || level !== "HIGH",
    sourceCount,
  };
}

/**
 * Format for the control tower dashboard API response.
 */
export function formatForDashboard(signal: UncertaintySignal, rawQuery: string) {
  return {
    query:    rawQuery,
    answer:   signal.annotatedAnswer,
    confidence: {
      score: signal.confidenceScore,
      level: signal.level,
      color: signal.color,
      label: signal.label,
    },
    warning:              signal.warningText,
    needsPhysicianReview: signal.needsPhysicianReview,
    sources:              { count: signal.sourceCount },
    metadata: {
      hedgeWordsDetected: signal.hedgeWordsFound.length,
      generatedAt:        new Date().toISOString(),
    },
  };
}
