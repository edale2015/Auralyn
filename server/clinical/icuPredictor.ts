/**
 * icuPredictor.ts — ICU admission probability predictor
 *
 * Article 28b (Command Center): "predictICUNeed(patient, sepsis):
 *   if sepsisRisk → +0.5
 *   if SBP < 90   → +0.3
 *   if lactate > 4 → +0.4
 *   icuProbability = min(risk, 1.0)
 *   needsICU = risk > 0.6"
 *
 * Threshold calibration:
 *   Lactate > 4 mmol/L = septic shock (Surviving Sepsis Campaign)
 *   SBP < 90 mmHg = shock threshold (requires vasopressors)
 *   Both together = near-certain ICU need
 *
 * Article 28c (Digital Twin):
 *   deteriorationRisk = news2 / 10   (normalized 0-1)
 *   icuProbability    = icuPredictor output
 *
 * Used by:
 *   validationHarness.ts → checks prediction vs expected
 *   multiPatientSimulator.ts → produces icuProbability per patient
 *   digitalTwin → projects cohort-level ICU pressure
 */

import type { SyntheticPatient } from "../simulation/patientGenerator";
import type { SepsisDetectionResult } from "./sepsisEngine";

export interface ICUPrediction {
  icuProbability:  number;    // 0-1
  needsICU:        boolean;   // probability > 0.6
  riskContributors: string[]; // what drove the score
  deteriorationRisk: number;  // news2 / 10, normalized
}

export function predictICUNeed(
  patient: Pick<SyntheticPatient, "vitals" | "labs">,
  sepsis:  SepsisDetectionResult,
): ICUPrediction {
  let risk = 0;
  const contributors: string[] = [];

  if (sepsis.sepsisRisk) {
    risk += 0.5;
    contributors.push(`Sepsis criteria met (+0.5): ${sepsis.triggers.join(", ")}`);
  }

  if (patient.vitals.sbp < 90) {
    risk += 0.3;
    contributors.push(`SBP ${patient.vitals.sbp} < 90 mmHg (+0.3) — shock`);
  }

  if (patient.labs.lactate > 4) {
    risk += 0.4;
    contributors.push(`Lactate ${patient.labs.lactate} > 4 mmol/L (+0.4) — septic shock`);
  }

  const icuProbability    = Math.min(Math.round(risk * 1000) / 1000, 1.0);
  const deteriorationRisk = Math.min(Math.round((sepsis.news2 / 10) * 1000) / 1000, 1.0);

  return {
    icuProbability,
    needsICU:         icuProbability > 0.6,
    riskContributors: contributors,
    deteriorationRisk,
  };
}
