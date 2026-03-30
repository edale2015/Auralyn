/**
 * DOMAIN 1 — REC 1.3: Adversarial Red Team Agent (4th Agent)
 *
 * This agent's sole purpose is to challenge consensus — it ALWAYS argues
 * for a higher acuity disposition and searches for missed evidence.
 * It does NOT contribute to the Bayesian model average (it is non-voting)
 * but it CAN force mandatory physician review if it finds meaningful
 * counter-evidence the other agents missed.
 *
 * MY ADDITION: Missed-symptom detector that cross-references the raw
 * text against the extracted symptom list to find extraction gaps.
 */

import { DispositionTier, escalateOneLevel } from "../../safety/hardStopRules";
import { logger } from "../../utils/logger";

export interface RedTeamInput {
  consensusDisposition:  string;
  consensusConfidence:   number;
  agentOpinions:         Array<{ agent: string; disposition: string; confidence: number; reasoning: string }>;
  rawPatientText:        string;
  extractedSymptoms:     string[];
  complaint:             string;
}

export interface RedTeamVerdict {
  challenged:               boolean;
  challengeDisposition?:    DispositionTier;
  counterEvidence:          string[];
  missedSymptoms:           string[];          // MY ADDITION
  alternativeDifferentials: string[];
  requiresPhysicianReview:  boolean;
  challengeConfidence:      number;
  challengeReason:          string;
}

// Symptom patterns that are clinically significant but often missed by LLMs
const FREQUENTLY_MISSED_SYMPTOMS: Array<{ keywords: string[]; symptom: string; severity: "high" | "medium" }> = [
  { keywords: ["sweating", "drenched", "soaking", "diaphoresis"], symptom: "diaphoresis", severity: "high" },
  { keywords: ["jaw pain", "jaw ache", "teeth hurt", "left arm"], symptom: "radiation_pattern", severity: "high" },
  { keywords: ["palpitations", "heart racing", "skipping beats", "fluttering"], symptom: "palpitations", severity: "medium" },
  { keywords: ["blood in stool", "dark stool", "black stool", "tarry"], symptom: "melena", severity: "high" },
  { keywords: ["worst headache", "thunderclap", "sudden headache"], symptom: "thunderclap_headache", severity: "high" },
  { keywords: ["can't walk straight", "off balance", "falling over"], symptom: "ataxia", severity: "high" },
  { keywords: ["double vision", "blurry", "seeing double"], symptom: "diplopia", severity: "medium" },
  { keywords: ["numbness", "tingling", "pins and needles"], symptom: "paresthesia", severity: "medium" },
];

function findMissedSymptoms(rawText: string, extractedSymptoms: string[]): string[] {
  const lowerText = rawText.toLowerCase();
  const extractedLower = extractedSymptoms.map(s => s.toLowerCase());
  const missed: string[] = [];

  for (const pattern of FREQUENTLY_MISSED_SYMPTOMS) {
    const keywordHit = pattern.keywords.some(k => lowerText.includes(k));
    const alreadyExtracted = extractedLower.some(s =>
      s.includes(pattern.symptom) || pattern.keywords.some(k => s.includes(k))
    );
    if (keywordHit && !alreadyExtracted) {
      missed.push(`${pattern.symptom} (${pattern.severity} severity) — detected in raw text but not extracted`);
    }
  }
  return missed;
}

function generateAlternativeDifferentials(complaint: string, rawText: string): string[] {
  const text = rawText.toLowerCase();
  const alternatives: string[] = [];

  if (complaint.includes("chest") || text.includes("chest")) {
    alternatives.push("Aortic dissection (if tearing/ripping quality)", "Pulmonary embolism (if pleuritic + dyspnea)");
  }
  if (complaint.includes("headache") || text.includes("head")) {
    alternatives.push("Subarachnoid hemorrhage (sudden onset)", "Meningitis (if fever + stiff neck)");
  }
  if (complaint.includes("abdominal") || text.includes("stomach") || text.includes("belly")) {
    alternatives.push("Ectopic pregnancy (female of childbearing age)", "Bowel obstruction (if distension)");
  }
  if (complaint.includes("dizzy") || text.includes("dizzy")) {
    alternatives.push("Vertebrobasilar insufficiency", "Carbon monoxide poisoning (if multiple family members affected)");
  }

  return alternatives;
}

export async function runRedTeamAgent(input: RedTeamInput): Promise<RedTeamVerdict> {
  const startMs = Date.now();

  const missedSymptoms  = findMissedSymptoms(input.rawPatientText, input.extractedSymptoms);
  const altDifferentials = generateAlternativeDifferentials(input.complaint, input.rawPatientText);

  const counterEvidence: string[] = [
    ...missedSymptoms.filter(m => m.includes("high severity")),
  ];

  // Parse current disposition to escalate
  const currentDisp = Object.values(DispositionTier).find(
    d => d.toLowerCase() === input.consensusDisposition?.toLowerCase()
  ) ?? DispositionTier.ROUTINE;

  const challengeDisposition = escalateOneLevel(currentDisp);
  const challenged = challengeDisposition !== currentDisp || missedSymptoms.length > 0;

  // Force physician review if: low confidence, missed symptoms, or meaningful counter-evidence
  const requiresPhysicianReview =
    input.consensusConfidence < 0.75 ||
    missedSymptoms.filter(m => m.includes("high severity")).length > 0 ||
    counterEvidence.length >= 2;

  const challengeConfidence = Math.min(
    0.5 + (missedSymptoms.length * 0.1) + (counterEvidence.length * 0.05),
    0.90
  );

  logger.info("red_team_evaluation", {
    challenged,
    missedCount:   missedSymptoms.length,
    counterCount:  counterEvidence.length,
    requiresReview: requiresPhysicianReview,
    durationMs:    Date.now() - startMs,
  });

  return {
    challenged,
    challengeDisposition: challenged ? challengeDisposition : undefined,
    counterEvidence,
    missedSymptoms,
    alternativeDifferentials: altDifferentials,
    requiresPhysicianReview,
    challengeConfidence,
    challengeReason: challenged
      ? `Red Team found ${missedSymptoms.length} missed symptoms and ${counterEvidence.length} counter-evidence items. Recommends escalation to ${challengeDisposition}.`
      : "Red Team found no material counter-evidence. Consensus stands.",
  };
}
