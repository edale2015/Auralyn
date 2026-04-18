/**
 * server/validation/generators/sepsisGenerator.ts
 * Gold-standard synthetic case generator for Sepsis.
 *
 * All generated cases require at minimum urgent evaluation — most are ED-level.
 * Any home disposition on a SIRS-criteria-meeting fever case is an unsafe undercall.
 */

import type { GeneratedCase } from "./peGenerator";

export function generateSepsisCases(n = 100): GeneratedCase[] {
  const cases: GeneratedCase[] = [];

  for (let i = 0; i < n; i++) {
    const hasHypotension       = Math.random() > 0.6;
    const hasAMS               = Math.random() > 0.5;
    const hasHighRR            = Math.random() > 0.4;
    const hasImmunocompromised = Math.random() > 0.5;
    const hasFocusInfection    = Math.random() > 0.4;  // UTI, pneumonia, skin source
    const hasRigorousShaking   = Math.random() > 0.5;

    // Sepsis with hypotension or AMS → ED mandatory
    const disposition: "ed" | "urgent_care" =
      hasHypotension || hasAMS ? "ed" : "ed"; // always ED for SIRS + source

    const redFlagCount = [hasHypotension, hasAMS, hasHighRR].filter(Boolean).length + 2; // fever + tachy always

    cases.push({
      id:        `sepsis_${i}`,
      complaint: "fever",
      observations: [
        { feature: "fever",              value: true },
        { feature: "tachycardia",        value: true },   // always present in SIRS
        { feature: "hypotension",        value: hasHypotension },
        { feature: "altered_mental_status", value: hasAMS },
        { feature: "high_respiratory_rate", value: hasHighRR },
        { feature: "immunocompromised",  value: hasImmunocompromised },
        { feature: "identified_infection_source", value: hasFocusInfection },
        { feature: "rigors",             value: hasRigorousShaking },
      ],
      expectedDisposition:    disposition,
      minimumSafeDisposition: "ed",
      redFlagCount,
      clinicalNotes:
        "SIRS + suspected source = sepsis protocol. No home pathway. Blood cultures and IV antibiotics cannot wait.",
    });
  }

  return cases;
}
