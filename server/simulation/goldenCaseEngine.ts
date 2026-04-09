/**
 * Golden Case Simulation Engine
 *
 * Pipeline-level validation harness. Every proposed change (KB update, RLHF
 * weight shift, scoring tweak) must pass through this before touching real data.
 *
 * Think of it as a clinical wind tunnel: the change runs against a curated set
 * of known-correct cases and must:
 *   1. Produce zero safety mismatches (missed ER_NOW detection) — hard block
 *   2. Maintain ≥ 95% disposition accuracy — quality threshold
 *
 * API note: runFinalPipeline() returns FinalPipelineOutput with:
 *   safetyDisposition: string — the safety outcome field
 * NOT safetyResult.finalDisposition (that was the old ChatGPT stub).
 */

import { runFinalPipeline, type FinalPipelineInput, type FinalPipelineOutput } from "../clinical/finalPipeline";
import { auditStep } from "../audit/auditLogger";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GoldenCase {
  caseId:               string;
  description?:         string;
  input:                FinalPipelineInput;
  expectedDisposition:  string;
  expectedDiagnosis?:   string;
  /** If true, a missed ER_NOW for this case counts as a safety mismatch */
  safetyCritical?:      boolean;
}

export interface CaseResult {
  caseId:          string;
  expected:        string;
  actual:          string;
  match:           boolean;
  safetyMismatch:  boolean;
  durationMs:      number;
  error?:          string;
}

export interface SimulationResult {
  totalCases:           number;
  correctDisposition:   number;
  incorrectDisposition: number;
  safetyMismatches:     number;
  accuracyRate:         number;
  durationMs:           number;
  details:              CaseResult[];
}

// ── Engine ────────────────────────────────────────────────────────────────────

/**
 * Run a golden case simulation against the current final pipeline.
 *
 * Designed to gate every proposed change — it compares the pipeline's actual
 * disposition output against the expected disposition for each curated case.
 *
 * Safety mismatches (expected ER_NOW, actual anything else) are tracked
 * separately because they represent the highest-stakes failure mode: a patient
 * who should have been sent to the ER was not.
 */
export async function runGoldenCaseSimulation(
  cases:   GoldenCase[],
  traceId: string
): Promise<SimulationResult> {
  const engineStart = Date.now();
  let correct        = 0;
  let incorrect      = 0;
  let safetyMismatches = 0;
  const details: CaseResult[] = [];

  for (const c of cases) {
    const caseStart = Date.now();
    try {
      const result: FinalPipelineOutput = runFinalPipeline(c.input);

      // Use safetyDisposition — the correct field on FinalPipelineOutput.
      // The ChatGPT stub used result.safetyResult.finalDisposition which is
      // a different API; this codebase uses result.safetyDisposition.
      const actual   = result.safetyDisposition;
      const expected = c.expectedDisposition;
      const match    = actual === expected;

      if (match) correct++;
      else incorrect++;

      // Safety mismatch: a case that should be ER_NOW was not caught.
      // Also flag any case marked safetyCritical where actual !== expected.
      const safetyMismatch =
        (expected === "ER_NOW" && actual !== "ER_NOW") ||
        (c.safetyCritical === true && !match);

      if (safetyMismatch) safetyMismatches++;

      details.push({
        caseId:         c.caseId,
        expected,
        actual,
        match,
        safetyMismatch,
        durationMs:     Date.now() - caseStart,
      });

    } catch (err) {
      incorrect++;
      safetyMismatches++; // error on an unknown case = conservative escalation needed
      details.push({
        caseId:         c.caseId,
        expected:       c.expectedDisposition,
        actual:         "ERROR",
        match:          false,
        safetyMismatch: true,
        durationMs:     Date.now() - caseStart,
        error:          err instanceof Error ? err.message : String(err),
      });
    }
  }

  const durationMs   = Date.now() - engineStart;
  const accuracyRate = cases.length > 0 ? correct / cases.length : 1;

  const result: SimulationResult = {
    totalCases:           cases.length,
    correctDisposition:   correct,
    incorrectDisposition: incorrect,
    safetyMismatches,
    accuracyRate,
    durationMs,
    details,
  };

  await auditStep({
    traceId,
    step:     "golden_case_simulation",
    input:    { totalCases: cases.length },
    output:   {
      correct,
      incorrect,
      safetyMismatches,
      accuracyRate: accuracyRate.toFixed(3),
      durationMs,
    },
    metadata: {},
  });

  return result;
}
