/**
 * server/validation/generators/acsGenerator.ts
 * Gold-standard synthetic case generator for Acute Coronary Syndrome (ACS).
 *
 * All generated cases expect ED disposition. Any urgent-care or home output
 * is an unsafe undercall — ACS presentations must never be triaged away from ED.
 */

import type { GeneratedCase } from "./peGenerator";

export function generateACSCases(n = 100): GeneratedCase[] {
  const cases: GeneratedCase[] = [];

  for (let i = 0; i < n; i++) {
    const hasRadiation    = Math.random() > 0.4;
    const hasDiaphoresis  = Math.random() > 0.5;
    const hasNausea       = Math.random() > 0.5;
    const hasDyspnea      = Math.random() > 0.4;
    const hasSyncope      = Math.random() > 0.7;
    const isElderly       = Math.random() > 0.5;       // higher pretest probability
    const isDiabetic      = Math.random() > 0.6;       // atypical presentations more common

    const redFlagCount = [hasRadiation, hasDiaphoresis, hasSyncope].filter(Boolean).length + 1;

    cases.push({
      id:        `acs_${i}`,
      complaint: "chest_pain",
      observations: [
        { feature: "chest_pain",          value: true },
        { feature: "radiation_left_arm",  value: hasRadiation },
        { feature: "diaphoresis",         value: hasDiaphoresis },
        { feature: "nausea_vomiting",     value: hasNausea },
        { feature: "dyspnea",             value: hasDyspnea },
        { feature: "syncope_presyncope",  value: hasSyncope },
        { feature: "elderly_patient",     value: isElderly },
        { feature: "diabetic_patient",    value: isDiabetic },
      ],
      expectedDisposition:    "ed",
      minimumSafeDisposition: "ed",
      redFlagCount,
      clinicalNotes:
        "ACS requires immediate ECG and troponin. No safe pathway below ED disposition for chest pain with cardiac features.",
    });
  }

  return cases;
}
