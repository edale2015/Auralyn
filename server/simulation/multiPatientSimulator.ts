/**
 * multiPatientSimulator.ts — Multi-patient simulation engine
 *
 * Article 28b (Command Center): "simulatePatients(n = 1000):
 *   Generate N patients → runValidation on each → return results array"
 *
 * Article 28c (Digital Twin): "runDigitalTwin():
 *   simulatePatients(200) → map to { patientId, deteriorationRisk, icuProbability }"
 *
 * Clinical translation:
 *   Run 1,000 synthetic patients through sepsis/ICU detection in one call.
 *   Results fuel RLHF weight updates, golden case generation, and FDA validation.
 *   Digital twin projects current cohort risk across the entire patient census.
 */

import { generatePatient, generateMixedCohort, type SyntheticPatient } from "./patientGenerator";
import { runValidation, runCohortValidation, type ValidationResult } from "../evals/validationHarness";

export interface SimulationRun {
  id:          string;
  n:           number;
  results:     ValidationResult[];
  summary: {
    total:    number;
    correct:  number;
    accuracy: number;
    fdaMet:   boolean;
    sepsisCases: number;
    icuCases:    number;
  };
  ranAt:       Date;
}

export interface DigitalTwinProjection {
  patientId:        string;
  deteriorationRisk: number;  // NEWS2 / 10
  icuProbability:   number;
}

// ── simulatePatients ──────────────────────────────────────────────────────────

export async function simulatePatients(n = 1000): Promise<SimulationRun> {
  const id       = `sim_${Date.now()}`;
  const patients = generateMixedCohort(n, 0.3);  // 30% sepsis baseline
  const { results, summary } = runCohortValidation(patients);

  return {
    id,
    n,
    results,
    summary: {
      ...summary,
      sepsisCases: results.filter((r) => r.sepsis.sepsisRisk).length,
      icuCases:    results.filter((r) => r.icu.needsICU).length,
    },
    ranAt: new Date(),
  };
}

// ── runDigitalTwin ────────────────────────────────────────────────────────────

export async function runDigitalTwin(n = 200): Promise<DigitalTwinProjection[]> {
  const run = await simulatePatients(n);
  return run.results.map((r) => ({
    patientId:         r.patientId,
    deteriorationRisk: r.icu.deteriorationRisk,
    icuProbability:    r.icu.icuProbability,
  }));
}
