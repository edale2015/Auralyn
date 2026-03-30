/**
 * DOMAIN 1 — REC 1.1: Independent Safety Agent Data Path
 *
 * The Safety Veto Agent must evaluate raw patient text INDEPENDENTLY of the
 * LLM-processed symptom objects — so upstream corruption (hallucination,
 * misclassification) cannot bypass safety detection.
 *
 * This module provides the independent rule-engine path:
 *   1. Runs hard-stop pattern matching against raw text (no LLM)
 *   2. Merges with LLM-derived red flags using UNION (never intersection)
 *   3. Applies age-stratified pediatric rules if age is known
 *   4. Returns a SafetyVerdict that the Safety Agent uses in the debate
 *
 * The debate engine will import this — safety agent always gets both paths.
 *
 * MY ADDITION: Contradiction detector — flags when LLM says "low severity"
 * but raw text contains emergency keywords (upstream corruption signal).
 */

import { evaluateHardStops, DispositionTier, HardStopRule } from "./hardStopRules";
import { evaluatePediatricSafety } from "./pediatricSafetyRules";
import { logger } from "../utils/logger";
import { emitEvent } from "../controlTower/eventBus";

export interface IndependentSafetyInput {
  rawPatientText:        string;
  extractedSymptoms:     string[];
  llmDerivedRedFlags:    string[];
  llmSuggestedDisposition?: string;
  ageMonths?:            number;
  temperatureC?:         number;
  respiratoryRate?:      number;
  heartRate?:            number;
  o2Saturation?:         number;
}

export interface SafetyVerdict {
  disposition:          DispositionTier;
  bypassDebate:         boolean;
  allRedFlags:          string[];                    // union of rule + LLM flags
  independentFlags:     string[];                    // rule-engine only
  llmFlags:             string[];
  contradictionDetected: boolean;                    // MY ADDITION
  contradictionReason?:  string;                     // MY ADDITION
  triggeringRule?:      HardStopRule;
  pediatricRisk:        boolean;
  auditTrail: {
    evaluatedAt:        string;
    rawTextLength:      number;
    hardStopTriggered:  boolean;
    pediatricBand?:     string;
  };
}

const LOW_SEVERITY_KEYWORDS = ["mild", "minor", "low risk", "self-care", "routine", "not urgent"];
const EMERGENCY_KEYWORDS = [
  "chest pain", "can't breathe", "unconscious", "stroke", "seizure",
  "bleeding heavily", "unresponsive", "vision loss", "throat closing",
];

function detectContradiction(
  rawText: string,
  llmDisposition?: string
): { detected: boolean; reason?: string } {
  if (!llmDisposition) return { detected: false };

  const lowerText = rawText.toLowerCase();
  const lowerDisposition = llmDisposition.toLowerCase();

  const llmSaysLow = LOW_SEVERITY_KEYWORDS.some(k => lowerDisposition.includes(k));
  const textHasEmergency = EMERGENCY_KEYWORDS.some(k => lowerText.includes(k));

  if (llmSaysLow && textHasEmergency) {
    const hits = EMERGENCY_KEYWORDS.filter(k => lowerText.includes(k));
    return {
      detected: true,
      reason: `LLM suggests low-severity disposition but raw text contains emergency keywords: [${hits.join(", ")}]`,
    };
  }

  return { detected: false };
}

export async function runIndependentSafetyEvaluation(
  input: IndependentSafetyInput
): Promise<SafetyVerdict> {
  const hardStopResult = evaluateHardStops(
    input.rawPatientText,
    input.extractedSymptoms,
    input.ageMonths
  );

  const pedResult = input.ageMonths !== undefined
    ? evaluatePediatricSafety({
        ageMonths:      input.ageMonths,
        temperatureC:   input.temperatureC,
        respiratoryRate: input.respiratoryRate,
        heartRate:      input.heartRate,
        o2Saturation:   input.o2Saturation,
      })
    : null;

  const independentFlags: string[] = [
    ...(hardStopResult.triggered ? [`HARD_STOP:${hardStopResult.rule?.ruleId}:${hardStopResult.rule?.symptomKey}`] : []),
    ...(pedResult?.isHighRisk ? pedResult.triggers : []),
  ];

  // UNION — every flag from either source is included
  const allRedFlags = Array.from(
    new Set([...independentFlags, ...input.llmDerivedRedFlags])
  );

  const contradiction = detectContradiction(input.rawPatientText, input.llmSuggestedDisposition);

  if (contradiction.detected) {
    logger.warn("safety_contradiction_detected", {
      reason: contradiction.reason,
      llmDisposition: input.llmSuggestedDisposition,
    });
    emitEvent({
      type: "ALERT",
      payload: {
        message: `Safety contradiction: ${contradiction.reason}`,
        severity: "HIGH",
      },
      timestamp: Date.now(),
    });
  }

  // Determine final disposition — most severe wins
  let disposition: DispositionTier = DispositionTier.ROUTINE;
  if (hardStopResult.triggered && hardStopResult.disposition) {
    disposition = hardStopResult.disposition;
  } else if (pedResult?.isHighRisk && pedResult.disposition) {
    disposition = pedResult.disposition as DispositionTier;
  } else if (allRedFlags.length > 0) {
    disposition = DispositionTier.ER_URGENT;
  }

  return {
    disposition,
    bypassDebate:          hardStopResult.bypassDebate,
    allRedFlags,
    independentFlags,
    llmFlags:              input.llmDerivedRedFlags,
    contradictionDetected: contradiction.detected,
    contradictionReason:   contradiction.reason,
    triggeringRule:        hardStopResult.rule,
    pediatricRisk:         pedResult?.isHighRisk ?? false,
    auditTrail: {
      evaluatedAt:       new Date().toISOString(),
      rawTextLength:     input.rawPatientText.length,
      hardStopTriggered: hardStopResult.triggered,
      pediatricBand:     pedResult?.band?.label,
    },
  };
}
