/**
 * Synthetic Patient Case Generator
 * Generates labeled test cases for pipeline validation and FDA performance reporting.
 * Produces cases across four clinical archetypes with realistic vital distributions.
 */

import type { CaseResult } from "./clinicalValidationEngine";

export interface TrialCase {
  id: string;
  symptoms: string[];
  vitals: {
    hr: number;
    rr: number;
    spo2: number;
    temp: number;
    sbp: number;
  };
  labs?: {
    lactate?: number;
    wbc?: number;
  };
  expectedDisposition: "ER_NOW" | "URGENT" | "ROUTINE";
  archetype: string;
}

function rand(min: number, max: number): number {
  return Math.round((min + Math.random() * (max - min)) * 10) / 10;
}

export function generateCases(n = 1000): TrialCase[] {
  const cases: TrialCase[] = [];

  for (let i = 0; i < n; i++) {
    const roll = Math.random();

    if (roll < 0.15) {
      // Critical — sepsis / shock (~15%)
      cases.push({
        id: `case_${i}`,
        archetype: "sepsis_shock",
        symptoms: ["fever", "shortness of breath", "altered mental status"],
        vitals: { hr: rand(115, 150), rr: rand(24, 36), spo2: rand(84, 91), temp: rand(38.5, 40.2), sbp: rand(68, 88) },
        labs: { lactate: rand(2.2, 5.0), wbc: rand(14, 22) },
        expectedDisposition: "ER_NOW",
      });
    } else if (roll < 0.22) {
      // Chest pain / STEMI risk (~7%)
      cases.push({
        id: `case_${i}`,
        archetype: "chest_pain_er",
        symptoms: ["chest pain", "diaphoresis", "arm pain"],
        vitals: { hr: rand(95, 130), rr: rand(18, 26), spo2: rand(90, 96), temp: rand(36.5, 37.5), sbp: rand(85, 105) },
        expectedDisposition: "ER_NOW",
      });
    } else if (roll < 0.45) {
      // Urgent — moderate illness (~23%)
      cases.push({
        id: `case_${i}`,
        archetype: "urgent_illness",
        symptoms: ["cough", "fever", "fatigue"],
        vitals: { hr: rand(88, 105), rr: rand(18, 22), spo2: rand(93, 96), temp: rand(38.0, 38.8), sbp: rand(105, 130) },
        expectedDisposition: "URGENT",
      });
    } else {
      // Routine — minor illness (~55%)
      cases.push({
        id: `case_${i}`,
        archetype: "routine_minor",
        symptoms: ["cough", "runny nose", "sore throat"],
        vitals: { hr: rand(65, 90), rr: rand(14, 18), spo2: rand(96, 100), temp: rand(36.4, 37.8), sbp: rand(110, 140) },
        expectedDisposition: "ROUTINE",
      });
    }
  }

  return cases;
}

export function casesToResults(
  cases: TrialCase[],
  getPredicted: (c: TrialCase) => "ER_NOW" | "URGENT" | "ROUTINE"
): CaseResult[] {
  return cases.map(c => ({
    caseId: c.id,
    actual: c.expectedDisposition,
    predicted: getPredicted(c),
  }));
}
