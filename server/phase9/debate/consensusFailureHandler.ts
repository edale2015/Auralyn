/**
 * DOMAIN 6 — REC 6.1 + 6.2: Consensus Failure Handler + Confidence Floor
 *
 * Handles two failure modes:
 *   A) All agents agree but are collectively wrong (unanimous low confidence)
 *   B) Confidence below disposition-specific floor (mandatory escalation)
 *
 * Also applies the 7-tier confidence calibration thresholds from Rec 6.2.
 *
 * MY ADDITION: Rare case detector and demographic risk flag that trigger
 * mandatory physician review even when confidence is above the floor.
 */

import { DispositionTier, escalateOneLevel } from "../../safety/hardStopRules";
import { emitEvent } from "../../controlTower/eventBus";
import { logger } from "../../utils/logger";

export const CONFIDENCE_THRESHOLDS: Record<string, number> = {
  [DispositionTier.ER_NOW]:         0.85,  // false negative = death
  [DispositionTier.ER_URGENT]:      0.80,
  [DispositionTier.URGENT_CARE]:    0.75,
  [DispositionTier.TELEHEALTH_NOW]: 0.70,
  [DispositionTier.NEXT_DAY]:       0.65,
  [DispositionTier.ROUTINE]:        0.60,
  [DispositionTier.SELF_CARE]:      0.85,  // false positive = missed emergency
};

export const CONFIDENCE_FLOOR = 0.72; // Below this = mandatory physician review for any disposition

// MY ADDITION: Rare complaint patterns that warrant physician review
const RARE_COMPLAINT_PATTERNS = [
  "rash with fever", "joint swelling multiple", "night sweats weight loss",
  "recurrent syncope", "hemoptysis", "painless jaundice",
];

// MY ADDITION: Demographic patterns associated with under-triage in literature
const DEMOGRAPHIC_RISK_PATTERNS = [
  "elderly", "over 70", "immunocompromised", "diabetic", "pregnant",
  "recent surgery", "on blood thinners", "anticoagulant",
];

export interface ConsensusInput {
  disposition:         string;
  confidence:          number;
  agentAgreementType:  "unanimous" | "majority" | "split" | "unanimous_low";
  redFlagsAddressed:   string[];
  rawText:             string;
  extractedSymptoms:   string[];
  patientContext?:     string;  // e.g., demographics, relevant history
}

export interface HandledConsensus {
  finalDisposition:       DispositionTier;
  adjustedConfidence:     number;
  requiresPhysicianReview: boolean;
  reviewReasons:          string[];
  confidenceBelowFloor:   boolean;
  isRareCase:             boolean;      // MY ADDITION
  demographicRiskFlag:    boolean;      // MY ADDITION
  escalated:              boolean;
}

function isRareCase(symptoms: string[], rawText: string): boolean {
  const text = (rawText + " " + symptoms.join(" ")).toLowerCase();
  return RARE_COMPLAINT_PATTERNS.some(p => text.includes(p));
}

function hasDemographicRisk(patientContext?: string): boolean {
  if (!patientContext) return false;
  const ctx = patientContext.toLowerCase();
  return DEMOGRAPHIC_RISK_PATTERNS.some(p => ctx.includes(p));
}

function hasUnexplainedRedFlags(
  extracted: string[],
  addressed: string[]
): boolean {
  const critical = extracted.filter(s =>
    s.includes("red_flag") || s.includes("HIGH") || s.includes("ER")
  );
  return critical.some(flag => !addressed.includes(flag));
}

export function handleConsensus(input: ConsensusInput): HandledConsensus {
  const reviewReasons: string[] = [];

  const threshold = CONFIDENCE_THRESHOLDS[input.disposition] ?? CONFIDENCE_FLOOR;
  const belowFloor = input.confidence < CONFIDENCE_FLOOR;
  const belowDispositionThreshold = input.confidence < threshold;

  if (belowFloor) {
    reviewReasons.push(`Confidence ${input.confidence.toFixed(2)} below universal floor ${CONFIDENCE_FLOOR}`);
  }
  if (belowDispositionThreshold && !belowFloor) {
    reviewReasons.push(`Confidence ${input.confidence.toFixed(2)} below ${input.disposition} threshold ${threshold}`);
  }
  if (input.agentAgreementType === "unanimous_low") {
    reviewReasons.push("All agents agreed but all reported low confidence — unanimous uncertainty");
  }

  const rareCase = isRareCase(input.extractedSymptoms, input.rawText);
  const demoRisk  = hasDemographicRisk(input.patientContext);
  const unexplainedFlags = hasUnexplainedRedFlags(input.extractedSymptoms, input.redFlagsAddressed);

  if (rareCase)          reviewReasons.push("Rare or atypical case presentation detected");
  if (demoRisk)          reviewReasons.push("High-risk demographic pattern — literature suggests under-triage risk");
  if (unexplainedFlags)  reviewReasons.push("Red flags detected but not addressed in consensus");

  const requiresPhysicianReview = reviewReasons.length > 0;

  // Parse disposition safely
  const currentDisp = Object.values(DispositionTier).find(
    d => d.toLowerCase() === input.disposition?.toLowerCase()
  ) ?? DispositionTier.ROUTINE;

  // If review required, escalate one level as safety measure
  const escalated = requiresPhysicianReview && currentDisp !== DispositionTier.ER_NOW;
  const finalDisposition = escalated ? escalateOneLevel(currentDisp) : currentDisp;

  if (requiresPhysicianReview) {
    logger.warn("consensus_failure_physician_review_required", {
      disposition:     input.disposition,
      finalDisposition,
      confidence:      input.confidence,
      reviewReasons,
    });
    emitEvent({
      type:      "PHYSICIAN_REVIEW_REQUIRED",
      payload:   { disposition: finalDisposition, reasons: reviewReasons, confidence: input.confidence },
      timestamp: Date.now(),
    });
  }

  return {
    finalDisposition,
    adjustedConfidence:     input.confidence,
    requiresPhysicianReview,
    reviewReasons,
    confidenceBelowFloor:   belowFloor,
    isRareCase:             rareCase,
    demographicRiskFlag:    demoRisk,
    escalated,
  };
}

export function requiresPhysicianEscalation(
  disposition: string,
  confidence: number
): boolean {
  const threshold = CONFIDENCE_THRESHOLDS[disposition] ?? CONFIDENCE_FLOOR;
  return confidence < threshold;
}
