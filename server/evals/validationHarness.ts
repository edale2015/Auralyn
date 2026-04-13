/**
 * validationHarness.ts — Clinical prediction validation harness
 *
 * Article 28b (Command Center): "runValidation(patient):
 *   detectSepsis → predictICUNeed → deriveExpected → compare → correct/incorrect"
 *
 * Article 28b: "deriveExpected(patient):
 *   sepsis = lactate > 2    (article's ground truth)
 *   icu    = SBP < 90       (article's ground truth)"
 *
 * This harness is the core comparison loop:
 *   Run the clinical prediction engine on a patient
 *   Compare prediction to expected ground truth
 *   Track accuracy across cohorts
 *
 * Article 28b accuracy formula:
 *   passRate = correct / total
 *   FDA threshold = 0.80 (SaMD Class II)
 *   Regression threshold = 0.95 (clinical safety)
 */

import type { SyntheticPatient } from "../simulation/patientGenerator";
import { detectSepsis } from "../clinical/sepsisEngine";
import { predictICUNeed } from "../clinical/icuPredictor";

// Re-export for convenience
export { detectSepsis, predictICUNeed };
import type { SepsisDetectionResult } from "../clinical/sepsisEngine";

export interface ExpectedOutcome {
  sepsis: boolean;   // lactate > 2
  icu:    boolean;   // SBP < 90
}

export interface ValidationResult {
  patientId: string;
  sepsis:    SepsisDetectionResult;
  icu:       ReturnType<typeof predictICUNeed>;
  expected:  ExpectedOutcome;
  correct:   boolean;
  errors:    string[];
}

export interface CohortValidationSummary {
  total:    number;
  correct:  number;
  accuracy: number;
  fdaMet:   boolean;   // accuracy >= 0.80
  errors:   string[];  // aggregated
}

// ── deriveExpected ────────────────────────────────────────────────────────────

export function deriveExpected(patient: SyntheticPatient): ExpectedOutcome {
  return {
    sepsis: patient.labs.lactate > 2,    // Article ground truth
    icu:    patient.vitals.sbp < 90,     // Article ground truth
  };
}

// ── runValidation ─────────────────────────────────────────────────────────────

export function runValidation(patient: SyntheticPatient): ValidationResult {
  const sepsis   = detectSepsis(patient.vitals, patient.labs);
  const icu      = predictICUNeed(patient, sepsis);
  const expected = deriveExpected(patient);
  const errors: string[] = [];

  if (expected.sepsis !== sepsis.sepsisRisk) {
    errors.push(`Sepsis mismatch: predicted=${sepsis.sepsisRisk}, expected=${expected.sepsis} (lactate=${patient.labs.lactate})`);
  }
  if (expected.icu !== icu.needsICU) {
    errors.push(`ICU mismatch: predicted=${icu.needsICU}, expected=${expected.icu} (SBP=${patient.vitals.sbp})`);
  }

  return {
    patientId: patient.id,
    sepsis,
    icu,
    expected,
    correct:   errors.length === 0,
    errors,
  };
}

// ── runCohortValidation ───────────────────────────────────────────────────────

export function runCohortValidation(patients: SyntheticPatient[]): {
  results:  ValidationResult[];
  summary:  CohortValidationSummary;
} {
  const results  = patients.map(runValidation);
  const correct  = results.filter((r) => r.correct).length;
  const accuracy = results.length > 0 ? Math.round((correct / results.length) * 1000) / 1000 : 0;
  const allErrors = results.flatMap((r) => r.errors);

  return {
    results,
    summary: {
      total:    results.length,
      correct,
      accuracy,
      fdaMet:   accuracy >= 0.80,
      errors:   allErrors,
    },
  };
}
