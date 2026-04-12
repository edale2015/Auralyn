/**
 * Clinical Gates — hard enforcement rules (Superpowers-style)
 * These gates block unsafe outputs BEFORE they escape the pipeline.
 * Additive to the existing safety layer — focused on scoring + stewardship.
 *
 * Gate 1: Scoring presence       — no disposition without clinical scoring
 * Gate 2: NEWS2 floor rule       — NEWS2 ≥ 5 MUST go to ED
 * Gate 3: Antibiotic stewardship — viral diagnosis cannot receive antibiotic disposition
 * Gate 4: ICU floor rule         — ICU_IMMINENT twin risk cannot be discharged home
 * Gate 5: Confidence minimum     — low-confidence dispositions require escalation
 */

export type GateStatus = "PASS" | "BLOCKED";

export interface GateCheck {
  gate:    string;
  status:  GateStatus;
  reason?: string;
}

export interface ClinicalGateResult {
  passed:   boolean;
  gates:    GateCheck[];
  blocker?: string;    // first blocking gate reason
}

export interface GateInput {
  diagnosis?:  { primary?: string; secondary?: string[] };
  scores?:     { NEWS2?: number; qSOFA?: number; sofa?: number; heartScore?: number };
  disposition: string;
  confidence?: number;
  icuProb?:    number;   // digital twin ICU probability
}

const VIRAL_DIAGNOSES = [
  "viral uri", "viral upper respiratory", "common cold", "viral pharyngitis",
  "influenza", "rsv", "rhinovirus", "viral syndrome", "viral illness",
];

const ANTIBIOTIC_TERMS = [
  "antibiotic", "amoxicillin", "azithromycin", "cephalexin",
  "ciprofloxacin", "doxycycline", "levofloxacin", "metronidazole",
];

const HOME_DISPOSITIONS = ["HOME", "DISCHARGE", "home", "discharge"];
const ED_DISPOSITIONS   = ["ED", "ER", "ER_IMMEDIATE", "ICU", "ICU_ADMIT", "URGENT_CARE"];

function checkScoringPresence(input: GateInput): GateCheck {
  const hasScores = input.scores && Object.keys(input.scores).length > 0;
  return {
    gate:   "scoring_presence",
    status: hasScores ? "PASS" : "BLOCKED",
    reason: hasScores ? undefined : "No clinical scoring present — disposition requires at least one validated score",
  };
}

function checkNEWS2Floor(input: GateInput): GateCheck {
  const news2 = input.scores?.NEWS2 ?? 0;
  if (news2 >= 5 && !ED_DISPOSITIONS.some((d) => input.disposition.includes(d))) {
    return {
      gate:   "news2_floor",
      status: "BLOCKED",
      reason: `NEWS2 score ${news2} ≥ 5 requires ED disposition — "${input.disposition}" is insufficient`,
    };
  }
  return { gate: "news2_floor", status: "PASS" };
}

function checkAntibioticStewardship(input: GateInput): GateCheck {
  const primaryDx     = (input.diagnosis?.primary ?? "").toLowerCase();
  const isViral       = VIRAL_DIAGNOSES.some((v) => primaryDx.includes(v));
  const hasAntibiotic = ANTIBIOTIC_TERMS.some((a) => input.disposition.toLowerCase().includes(a));

  if (isViral && hasAntibiotic) {
    return {
      gate:   "antibiotic_stewardship",
      status: "BLOCKED",
      reason: `Antibiotic stewardship violation: "${input.diagnosis?.primary}" is viral — antibiotics not indicated`,
    };
  }
  return { gate: "antibiotic_stewardship", status: "PASS" };
}

function checkICUFloor(input: GateInput): GateCheck {
  if ((input.icuProb ?? 0) > 0.70 && HOME_DISPOSITIONS.some((d) => input.disposition.includes(d))) {
    return {
      gate:   "icu_floor",
      status: "BLOCKED",
      reason: `Digital twin ICU probability ${(input.icuProb! * 100).toFixed(0)}% > 70% — patient cannot be discharged home`,
    };
  }
  return { gate: "icu_floor", status: "PASS" };
}

function checkConfidenceMinimum(input: GateInput): GateCheck {
  const conf = input.confidence ?? 1.0;
  if (conf < 0.50 && HOME_DISPOSITIONS.some((d) => input.disposition.includes(d))) {
    return {
      gate:   "confidence_minimum",
      status: "BLOCKED",
      reason: `Confidence ${(conf * 100).toFixed(0)}% < 50% — cannot discharge home with low confidence`,
    };
  }
  return { gate: "confidence_minimum", status: "PASS" };
}

export function enforceClinicalGates(input: GateInput): ClinicalGateResult {
  const gates: GateCheck[] = [
    checkScoringPresence(input),
    checkNEWS2Floor(input),
    checkAntibioticStewardship(input),
    checkICUFloor(input),
    checkConfidenceMinimum(input),
  ];

  const blocked = gates.find((g) => g.status === "BLOCKED");

  if (blocked) {
    return { passed: false, gates, blocker: blocked.reason };
  }

  return { passed: true, gates };
}
