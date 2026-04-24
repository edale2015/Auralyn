/**
 * server/safety/sepsisGate.ts
 * Safety gate for sepsis / septic shock decisions.
 *
 * Rule: no autonomous medication orders when septic shock is flagged.
 * Physician approval required — suggested actions are advisory only.
 */

import type { SepsisAnalysis } from "../agents/sepsisAgent";

export interface SepsisGateResult {
  allowed:           boolean;
  requiresPhysician: boolean;
  message:           string;
  suggested?:        string[];
}

export function sepsisSafetyGate(analysis: SepsisAnalysis): SepsisGateResult {
  if (analysis.flags?.septicShock) {
    return {
      allowed:           false,
      requiresPhysician: true,
      message:           "Possible septic shock — physician approval required before any intervention",
      suggested: [
        "IV fluid bolus (30 mL/kg crystalloid)",
        "Vasopressor initiation (norepinephrine first-line)",
        "Broad-spectrum antibiotics within 1 hour (pending cultures)",
        "Lactate remeasurement in 2 hours",
        "ICU transfer evaluation",
      ],
    };
  }

  if (analysis.flags?.highRisk) {
    return {
      allowed:           false,
      requiresPhysician: true,
      message:           "High sepsis probability — physician review required",
      suggested: [
        "Blood cultures × 2 before antibiotics",
        "IV fluid assessment",
        "Repeat lactate if ≥ 2 mmol/L",
        "Antibiotic de-escalation review in 48-72h",
      ],
    };
  }

  return {
    allowed:           true,
    requiresPhysician: false,
    message:           "Sepsis risk within acceptable range — continue monitoring",
  };
}
