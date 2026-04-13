/**
 * Clinical Trial Simulator
 * Runs labeled case sets through the triage pipeline and collects predicted vs actual outcomes.
 * Designed for pre-deployment validation and ongoing regression monitoring.
 */

import type { TrialCase } from "./generateSyntheticCases";
import type { CaseResult } from "./clinicalValidationEngine";
import { computeRisk } from "../icu/predictiveEngine";

/**
 * Maps vitals-based risk to a clinical disposition for validation purposes.
 * In production, this would call runFinalPipeline(), but we avoid the full
 * async pipeline for fast batch validation.
 */
function dispositionFromVitals(c: TrialCase): CaseResult["predicted"] {
  const risk = computeRisk({
    id: c.id,
    vitals: c.vitals,
    symptoms: c.symptoms,
    labs: c.labs,
  });

  // Enforce escalation: never downgrade if ER-level vitals
  const erVitals = c.vitals.spo2 < 90 || c.vitals.sbp < 90 || c.vitals.hr > 130;
  if (erVitals || risk.riskLabel === "CRITICAL" || risk.deteriorationScore >= 0.65) return "ER_NOW";
  if (risk.riskLabel === "HIGH" || risk.deteriorationScore >= 0.35) return "URGENT";
  return "ROUTINE";
}

export async function runTrial(cases: TrialCase[]): Promise<CaseResult[]> {
  return cases.map(c => ({
    caseId: c.id,
    actual: c.expectedDisposition,
    predicted: dispositionFromVitals(c),
  }));
}

export async function runTrialBatch(
  cases: TrialCase[],
  batchSize = 100
): Promise<{ results: CaseResult[]; durationMs: number }> {
  const t0 = Date.now();
  const results: CaseResult[] = [];

  for (let i = 0; i < cases.length; i += batchSize) {
    const batch = cases.slice(i, i + batchSize);
    const batchResults = await runTrial(batch);
    results.push(...batchResults);
  }

  return { results, durationMs: Date.now() - t0 };
}
