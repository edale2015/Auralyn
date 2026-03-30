/**
 * DOMAIN 6 — REC 1.3: Adversarial Red Team Agent (4th Agent)
 *
 * CLAUDE REVIEW ADDITIONS (Round 2):
 *   - 5 new missed patterns: AAA, orthostatic hypotension, hemoptysis, Ludwig's angina, adult epiglottitis
 *   - Context-aware trigger: pediatric/pregnant patients = any missed symptom triggers review
 *   - confidenceThresholdAdjustment: influences how much Red Team challenge lowers the physician review bar
 *   - DEBATE_TIMEOUT_CONFIG: 8s per agent, 20s total, conservative fallback
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
  // Claude rec: context for adjusted trigger thresholds
  patientContext?: {
    isPediatric:   boolean;
    isPregnant:    boolean;
    isElderly:     boolean;
  };
}

export interface RedTeamVerdict {
  challenged:                      boolean;
  challengeDisposition?:           DispositionTier;
  counterEvidence:                 string[];
  missedSymptoms:                  string[];
  alternativeDifferentials:        string[];
  requiresPhysicianReview:         boolean;
  challengeConfidence:             number;
  challengeReason:                 string;
  // Claude rec: adjusts the physician review threshold when challenge is high confidence
  confidenceThresholdAdjustment:   number;  // 0 to -0.15 (negative = lower the bar)
}

/**
 * Claude rec: debate timeout configuration.
 * Without a timeout, a slow LLM call can block patient disposition indefinitely.
 */
export const DEBATE_TIMEOUT_CONFIG = {
  singleAgentTimeoutMs:  8_000,    // 8 seconds per agent
  totalDebateTimeoutMs:  20_000,   // 20 seconds for full 3+1 agent debate
  timeoutBehavior:       "use_most_conservative_available_opinion" as const,
  zeroOpinionsBehavior:  "physician_escalation_with_timeout_flag" as const,
};

// Original 8 patterns + Claude rec: 5 additional ENT/flu-relevant patterns
const FREQUENTLY_MISSED_SYMPTOMS: Array<{
  key:      string;
  keywords: string[];
  symptom:  string;
  severity: "high" | "medium";
  notes:    string;
}> = [
  // Original 8
  { key: "diaphoresis",           keywords: ["sweating", "drenched", "soaking", "diaphoresis"],                     symptom: "diaphoresis",             severity: "high",   notes: "ACS signal" },
  { key: "radiation_pattern",     keywords: ["jaw pain", "jaw ache", "teeth hurt", "left arm"],                     symptom: "radiation_pattern",       severity: "high",   notes: "Cardiac radiation" },
  { key: "palpitations",          keywords: ["palpitations", "heart racing", "skipping beats", "fluttering"],       symptom: "palpitations",            severity: "medium", notes: "Arrhythmia signal" },
  { key: "melena",                keywords: ["blood in stool", "dark stool", "black stool", "tarry"],               symptom: "melena",                  severity: "high",   notes: "GI bleed" },
  { key: "thunderclap_headache",  keywords: ["worst headache", "thunderclap", "sudden headache"],                   symptom: "thunderclap_headache",    severity: "high",   notes: "SAH signal" },
  { key: "ataxia",                keywords: ["can't walk straight", "off balance", "falling over"],                 symptom: "ataxia",                  severity: "high",   notes: "Cerebellar stroke" },
  { key: "diplopia",              keywords: ["double vision", "blurry", "seeing double"],                           symptom: "diplopia",                severity: "medium", notes: "CN III palsy / stroke" },
  { key: "paresthesia",           keywords: ["numbness", "tingling", "pins and needles"],                           symptom: "paresthesia",             severity: "medium", notes: "Neurological signal" },
  // Claude rec: 5 additional ENT/flu-relevant patterns
  { key: "aaa_pattern",           keywords: ["pulsating", "abdominal mass", "flank pain", "older male"],            symptom: "aaa_pattern",             severity: "high",   notes: "AAA — especially males >65 with back/flank pain" },
  { key: "orthostatic_hypotension", keywords: ["dizzy standing", "black out standing", "lightheaded standing up", "falls"], symptom: "orthostatic_hypotension", severity: "medium", notes: "Dehydration / sepsis / medication signal" },
  { key: "productive_cough_hemoptysis", keywords: ["blood in sputum", "coughing blood", "pink frothy", "rust colored"], symptom: "hemoptysis",             severity: "high",   notes: "TB / PE / pneumonia with cavitation — critical for Flu pack" },
  { key: "ludwig_angina",         keywords: ["floor of mouth", "neck swelling", "dental pain", "can't swallow", "jaw swelling", "tooth pain"], symptom: "ludwig_angina",           severity: "high",   notes: "Ludwig's angina — rapidly fatal dental space infection, ENT-relevant" },
  { key: "epiglottitis_adult",    keywords: ["severe sore throat", "can't swallow", "sitting forward", "drooling", "tripod position", "no voice"], symptom: "epiglottitis_adult",      severity: "high",   notes: "Adult epiglottitis — same mortality risk as pediatric, less common" },
];

function findMissedSymptoms(rawText: string, extractedSymptoms: string[]): Array<{
  symptom: string; severity: "high" | "medium"; note: string;
}> {
  const lowerText     = rawText.toLowerCase();
  const extractedLow  = extractedSymptoms.map(s => s.toLowerCase());
  const missed = [];

  for (const pattern of FREQUENTLY_MISSED_SYMPTOMS) {
    const hit         = pattern.keywords.some(k => lowerText.includes(k));
    const extracted   = extractedLow.some(s =>
      s.includes(pattern.key) || pattern.keywords.some(k => s.includes(k))
    );
    if (hit && !extracted) {
      missed.push({ symptom: pattern.symptom, severity: pattern.severity, note: pattern.notes });
    }
  }
  return missed;
}

function generateAlternativeDifferentials(complaint: string, rawText: string): string[] {
  const text = rawText.toLowerCase();
  const alts: string[] = [];

  if (complaint.includes("chest") || text.includes("chest")) {
    alts.push("Aortic dissection (tearing quality)", "Pulmonary embolism (pleuritic + dyspnea)");
  }
  if (complaint.includes("headache") || text.includes("head")) {
    alts.push("Subarachnoid hemorrhage (sudden onset)", "Meningitis (fever + stiff neck)");
  }
  if (complaint.includes("abdominal") || text.includes("stomach") || text.includes("belly")) {
    alts.push("Ectopic pregnancy (female childbearing age)", "Bowel obstruction (distension)", "AAA (pulsating mass, male >65)");
  }
  if (complaint.includes("dizzy") || text.includes("dizzy")) {
    alts.push("Vertebrobasilar insufficiency", "Carbon monoxide poisoning (multiple family members)");
  }
  if (text.includes("sore throat") || text.includes("throat")) {
    alts.push("Epiglottitis (severe, rapid onset, dysphagia)", "Ludwig's angina (dental history)");
  }
  if (text.includes("cough") || text.includes("sputum")) {
    alts.push("Pneumonia with hemoptysis (rust-colored sputum)", "Pulmonary embolism (pleuritic)");
  }

  return alts;
}

/**
 * Claude rec: context-aware physician review trigger.
 * Pediatric or pregnant patients = any missed symptom triggers review (lower bar).
 * General population = only high-severity missed symptoms trigger review.
 */
function redTeamRequiresPhysicianReview(
  missedHighSeverity: number,
  missedAny:          number,
  counterEvidence:    number,
  consensusConf:      number,
  context?:           RedTeamInput["patientContext"]
): boolean {
  if (consensusConf < 0.75) return true;
  if (context?.isPediatric || context?.isPregnant) {
    return missedAny >= 1;   // Any missed symptom for vulnerable groups
  }
  return missedHighSeverity >= 1 || counterEvidence >= 2;
}

export async function runRedTeamAgent(input: RedTeamInput): Promise<RedTeamVerdict> {
  const startMs = Date.now();

  const missedDetailed   = findMissedSymptoms(input.rawPatientText, input.extractedSymptoms);
  const missedHigh       = missedDetailed.filter(m => m.severity === "high");
  const missedSymptoms   = missedDetailed.map(m => `${m.symptom} (${m.severity}) — ${m.note}`);
  const counterEvidence  = missedHigh.map(m => `${m.symptom} detected in raw text but not extracted — ${m.note}`);
  const altDifferentials = generateAlternativeDifferentials(input.complaint, input.rawPatientText);

  const currentDisp = Object.values(DispositionTier).find(
    d => d.toLowerCase() === input.consensusDisposition?.toLowerCase()
  ) ?? DispositionTier.ROUTINE;

  const challengeDisposition  = escalateOneLevel(currentDisp);
  const challenged             = challengeDisposition !== currentDisp || missedDetailed.length > 0;

  const requiresPhysicianReview = redTeamRequiresPhysicianReview(
    missedHigh.length, missedDetailed.length,
    counterEvidence.length, input.consensusConfidence,
    input.patientContext
  );

  const challengeConfidence = Math.min(
    0.5 + (missedDetailed.length * 0.1) + (counterEvidence.length * 0.05),
    0.90
  );

  // Claude rec: confidence threshold adjustment
  // High challenge confidence → lower the physician review threshold
  const confidenceThresholdAdjustment = requiresPhysicianReview
    ? Math.max(-0.15, -challengeConfidence * 0.15)
    : 0;

  logger.info("red_team_evaluation", {
    challenged,
    missedCount:    missedDetailed.length,
    missedHigh:     missedHigh.length,
    counterCount:   counterEvidence.length,
    requiresReview: requiresPhysicianReview,
    isPediatric:    input.patientContext?.isPediatric,
    isPregnant:     input.patientContext?.isPregnant,
    durationMs:     Date.now() - startMs,
  });

  return {
    challenged,
    challengeDisposition:          challenged ? challengeDisposition : undefined,
    counterEvidence,
    missedSymptoms,
    alternativeDifferentials:      altDifferentials,
    requiresPhysicianReview,
    challengeConfidence,
    challengeReason: challenged
      ? `Red Team found ${missedDetailed.length} missed symptoms (${missedHigh.length} high-severity) and ${counterEvidence.length} counter-evidence items. Recommends escalation to ${challengeDisposition}.`
      : "Red Team found no material counter-evidence. Consensus stands.",
    confidenceThresholdAdjustment,
  };
}
