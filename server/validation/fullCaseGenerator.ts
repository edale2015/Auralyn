/**
 * Full case generator — produces 1 000+ synthetic golden cases
 * across five major complaint domains.
 *
 * Cases include both clean presentations and adversarial variants
 * (sparse observations, contradictions, missing critical features).
 */

import { GoldenCase, GoldenCaseObservation } from "./goldenCaseTypes";

function rnd(prob: number): boolean {
  return Math.random() > (1 - prob);
}

// ─── PE (pulmonary embolism) ───────────────────────────────────────────────

function generatePE(n: number): GoldenCase[] {
  return Array.from({ length: n }, (_, i) => ({
    id:          `pe_${i}`,
    complaint:   "shortness_of_breath",
    title:       `PE Case ${i}`,
    observations: [
      { feature: "sob",                  value: true },
      { feature: "tachycardia",          value: rnd(0.8) },
      { feature: "pleuritic_chest_pain", value: rnd(0.6) },
      { feature: "normal_o2",            value: rnd(0.3) }, // adversarial
    ] as GoldenCaseObservation[],
    presentationProfile: {
      complaint: "shortness_of_breath",
      requiredFeaturesAnyOf: ["sob"],
      stronglyExpectedFeaturesAnyOf: ["tachycardia", "pleuritic_chest_pain"],
    },
    expectedTopDiagnosis:    "pe",
    expectedDisposition:     "ed",
    minimumSafeDisposition:  "ed",
    redFlagCount:            1,
  }));
}

// ─── ACS (acute coronary syndrome) ────────────────────────────────────────

function generateACS(n: number): GoldenCase[] {
  return Array.from({ length: n }, (_, i) => ({
    id:          `acs_${i}`,
    complaint:   "chest_pain",
    title:       `ACS Case ${i}`,
    observations: [
      { feature: "chest_pain",           value: true },
      { feature: "radiation_left_arm",   value: rnd(0.6) },
      { feature: "diaphoresis",          value: rnd(0.5) },
      { feature: "nausea",               value: rnd(0.4) },
    ] as GoldenCaseObservation[],
    presentationProfile: {
      complaint: "chest_pain",
      requiredFeaturesAnyOf: ["chest_pain"],
      stronglyExpectedFeaturesAnyOf: ["radiation_left_arm", "diaphoresis"],
    },
    expectedTopDiagnosis:    "acs",
    expectedDisposition:     "ed",
    minimumSafeDisposition:  "ed",
    redFlagCount:            1,
  }));
}

// ─── Sepsis ────────────────────────────────────────────────────────────────

function generateSepsis(n: number): GoldenCase[] {
  return Array.from({ length: n }, (_, i) => ({
    id:          `sepsis_${i}`,
    complaint:   "fever",
    title:       `Sepsis Case ${i}`,
    observations: [
      { feature: "fever",       value: true },
      { feature: "tachycardia", value: true },
      { feature: "hypotension", value: rnd(0.4) },
      { feature: "altered_ms",  value: rnd(0.3) },
    ] as GoldenCaseObservation[],
    presentationProfile: {
      complaint: "fever",
      requiredFeaturesAnyOf: ["fever"],
    },
    expectedTopDiagnosis:    "sepsis",
    expectedDisposition:     "ed",
    minimumSafeDisposition:  "ed",
    redFlagCount:            2,
  }));
}

// ─── Stroke ────────────────────────────────────────────────────────────────

function generateStroke(n: number): GoldenCase[] {
  return Array.from({ length: n }, (_, i) => ({
    id:          `stroke_${i}`,
    complaint:   "neurologic",
    title:       `Stroke Case ${i}`,
    observations: [
      { feature: "facial_droop",     value: rnd(0.7) },
      { feature: "arm_weakness",     value: rnd(0.8) },
      { feature: "speech_difficulty",value: true },
      { feature: "sudden_onset",     value: rnd(0.9) },
    ] as GoldenCaseObservation[],
    presentationProfile: {
      complaint: "neurologic",
      requiredFeaturesAnyOf: ["facial_droop", "arm_weakness", "speech_difficulty"],
    },
    expectedTopDiagnosis:    "stroke",
    expectedDisposition:     "call_911",
    minimumSafeDisposition:  "call_911",
    redFlagCount:            2,
  }));
}

// ─── Pediatric fever ───────────────────────────────────────────────────────

function generatePeds(n: number): GoldenCase[] {
  return Array.from({ length: n }, (_, i) => ({
    id:          `peds_${i}`,
    complaint:   "fever",
    title:       `Peds Fever Case ${i}`,
    observations: [
      { feature: "fever",           value: true },
      { feature: "lethargy",        value: rnd(0.5) },
      { feature: "normal_activity", value: rnd(0.4) }, // contradiction
    ] as GoldenCaseObservation[],
    presentationProfile: {
      complaint: "fever",
      requiredFeaturesAnyOf: ["fever"],
    },
    expectedDisposition:    "ed",
    minimumSafeDisposition: "ed",
    redFlagCount:           1,
  }));
}

// ─── Public API ────────────────────────────────────────────────────────────

/** Generate 1 000 synthetic cases (200 per domain). */
export function generateFullCaseSet(): GoldenCase[] {
  return [
    ...generatePE(200),
    ...generateACS(200),
    ...generateSepsis(200),
    ...generateStroke(200),
    ...generatePeds(200),
  ];
}

/** Seed pack: 6 hand-crafted canonical cases for CI smoke tests. */
export const seedGoldenCases: GoldenCase[] = [
  {
    id: "pe_seed_1", complaint: "shortness_of_breath", title: "PE classic pleuritic pain",
    observations: [
      { feature: "sob",                  value: true },
      { feature: "pleuritic_chest_pain", value: true },
      { feature: "tachycardia",          value: true },
    ],
    presentationProfile: { complaint: "shortness_of_breath", requiredFeaturesAnyOf: ["sob"] },
    expectedTopDiagnosis: "pe", expectedDisposition: "ed", minimumSafeDisposition: "ed", redFlagCount: 1,
  },
  {
    id: "acs_seed_1", complaint: "chest_pain", title: "Typical ACS",
    observations: [
      { feature: "chest_pain",         value: true },
      { feature: "radiation_left_arm", value: true },
      { feature: "diaphoresis",        value: true },
    ],
    presentationProfile: { complaint: "chest_pain", requiredFeaturesAnyOf: ["chest_pain"] },
    expectedTopDiagnosis: "acs", expectedDisposition: "ed", minimumSafeDisposition: "ed", redFlagCount: 1,
  },
  {
    id: "sepsis_seed_1", complaint: "fever", title: "Sepsis pattern",
    observations: [
      { feature: "fever",       value: true },
      { feature: "tachycardia", value: true },
      { feature: "hypotension", value: true },
    ],
    presentationProfile: { complaint: "fever", requiredFeaturesAnyOf: ["fever"] },
    expectedTopDiagnosis: "sepsis", expectedDisposition: "ed", minimumSafeDisposition: "ed", redFlagCount: 2,
  },
  {
    id: "stroke_seed_1", complaint: "neurologic", title: "Stroke FAST positive",
    observations: [
      { feature: "facial_droop",      value: true },
      { feature: "arm_weakness",      value: true },
      { feature: "speech_difficulty", value: true },
    ],
    presentationProfile: { complaint: "neurologic", requiredFeaturesAnyOf: ["facial_droop", "arm_weakness"] },
    expectedTopDiagnosis: "stroke", expectedDisposition: "call_911", minimumSafeDisposition: "call_911", redFlagCount: 2,
  },
  {
    id: "pna_seed_1", complaint: "cough", title: "Classic pneumonia",
    observations: [
      { feature: "fever", value: true },
      { feature: "cough", value: true },
      { feature: "sob",   value: true },
    ],
    presentationProfile: { complaint: "cough", requiredFeaturesAnyOf: ["cough"] },
    expectedTopDiagnosis: "pneumonia", expectedDisposition: "urgent_care",
  },
  {
    id: "peds_seed_1", complaint: "fever", title: "Pediatric fever lethargy",
    observations: [
      { feature: "fever",   value: true },
      { feature: "lethargy",value: true },
    ],
    presentationProfile: { complaint: "fever", requiredFeaturesAnyOf: ["fever"] },
    expectedDisposition: "ed", minimumSafeDisposition: "ed", redFlagCount: 1,
  },
];
