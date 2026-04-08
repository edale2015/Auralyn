/**
 * importanceUtils.ts
 * Computes weighted failure impact from engine importance scores,
 * and adjusts uncertainty to reflect degraded system state.
 *
 * Used by clinicalBrainEngine.ts to ensure:
 *   - A failed riskStratificationEngine (importance=5) matters far more
 *     than a failed findSimilarMemoryCases (importance=2).
 *   - The output uncertainty score reflects how many critical engines failed,
 *     preventing false confidence when the system is degraded.
 */

export interface EngineImportance {
  name:       string;
  importance: 1 | 2 | 3 | 4 | 5;
  critical:   boolean;
}

export interface EngineFailureSummary {
  engine:   string;
  timedOut: boolean;
  error?:   string;
}

const ENGINE_IMPORTANCE_MAP: Record<string, EngineImportance> = {
  normalizeSymptoms:                { name: "normalizeSymptoms",                importance: 4, critical: true  },
  detectRedFlags:                   { name: "detectRedFlags",                   importance: 5, critical: true  },
  safetyGuard:                      { name: "safetyGuard",                      importance: 5, critical: true  },
  computeDifferentialProbabilities: { name: "computeDifferentialProbabilities", importance: 5, critical: true  },
  computeUncertainty:               { name: "computeUncertainty",               importance: 4, critical: false },
  findSimilarCasesForState:         { name: "findSimilarCasesForState",         importance: 2, critical: false },
  findSimilarMemoryCases:           { name: "findSimilarMemoryCases",           importance: 2, critical: false },
  complaintCompletenessEngine:      { name: "complaintCompletenessEngine",      importance: 3, critical: false },
  selectNextBestQuestion:           { name: "selectNextBestQuestion",           importance: 5, critical: true  },
  diagnosticEvidenceEngine:         { name: "diagnosticEvidenceEngine",         importance: 4, critical: false },
  evidenceAggregatorEngine:         { name: "evidenceAggregatorEngine",         importance: 4, critical: false },
  riskStratificationEngine:         { name: "riskStratificationEngine",         importance: 5, critical: true  },
  temporalProgressionEngine:        { name: "temporalProgressionEngine",        importance: 3, critical: false },
  guidelineAdherenceEngine:         { name: "guidelineAdherenceEngine",         importance: 3, critical: false },
  contradictionEngine:              { name: "contradictionEngine",              importance: 4, critical: false },
  getBulkRecommendations:           { name: "getBulkRecommendations",           importance: 5, critical: true  },
  prioritizeTests:                  { name: "prioritizeTests",                  importance: 3, critical: false },
  generateBulkReturnPrecautions:    { name: "generateBulkReturnPrecautions",    importance: 5, critical: true  },
  dispositionCalibrationEngine:     { name: "dispositionCalibrationEngine",     importance: 5, critical: true  },
  clinicalGovernanceEngine:         { name: "clinicalGovernanceEngine",         importance: 5, critical: true  },
  physicianReviewPacketEngine:      { name: "physicianReviewPacketEngine",      importance: 3, critical: false },
  severityScoringEngine:            { name: "severityScoringEngine",            importance: 4, critical: false },
  crossComplaintRouterEngine:       { name: "crossComplaintRouterEngine",       importance: 3, critical: false },
  protocolVarianceEngine:           { name: "protocolVarianceEngine",           importance: 3, critical: false },
  diagnosticDriftEngine:            { name: "diagnosticDriftEngine",            importance: 2, critical: false },
  unifiedClinicalGovernanceEngine:  { name: "unifiedClinicalGovernanceEngine",  importance: 4, critical: false },
  medicationSafetyEngine:           { name: "medicationSafetyEngine",           importance: 4, critical: false },
  testYieldEngine:                  { name: "testYieldEngine",                  importance: 3, critical: false },
  physicianFeedbackLearningEngine:  { name: "physicianFeedbackLearningEngine",  importance: 2, critical: false },
  logBrainDecision:                 { name: "logBrainDecision",                 importance: 2, critical: false },
  storeClinicalCase:                { name: "storeClinicalCase",                importance: 2, critical: false },
};

/**
 * Returns the importance descriptor for an engine by name.
 * Falls back to importance=3 (moderate), critical=false for unknown engines.
 */
export function getEngineImportance(engineName: string): EngineImportance {
  return ENGINE_IMPORTANCE_MAP[engineName] ?? {
    name:       engineName,
    importance: 3,
    critical:   false,
  };
}

/**
 * Computes a weighted failure impact score from a list of failed engines.
 *
 * Scoring:
 *   - Each engine contributes its importance (1–5) to the impact.
 *   - Critical engines double their contribution.
 *   - Max realistic score for a catastrophic failure: ~80.
 *
 * Severity bands (used by clinicalBrainEngine.ts):
 *   impact >= 10 → "high"
 *   impact >= 5  → "moderate"
 *   otherwise    → "low"
 */
export function computeFailureImpact(failures: EngineFailureSummary[]): number {
  let impact = 0;
  for (const f of failures) {
    const desc = getEngineImportance(f.engine);
    impact += desc.importance * (desc.critical ? 2 : 1);
  }
  return impact;
}

/**
 * Adjusts the base uncertainty score upward based on failure impact.
 * Uses a dynamically configurable scale factor (defaults to 0.03 per impact point).
 *
 * Example: 3 critical engine failures (impact=30) with scale=0.03 → +0.9 → capped at 1.0
 * Example: 2 non-critical failures (impact=4) with scale=0.03 → +0.12
 */
export function adjustUncertainty(
  baseUncertainty: number,
  failureImpact:   number,
  scale:           number = 0.03,
): number {
  return Math.min(1.0, baseUncertainty + failureImpact * scale);
}

/**
 * Maps a failure impact score to a degradation severity label.
 */
export function degradationSeverity(
  failureImpact: number,
): "high" | "moderate" | "low" | "none" {
  if (failureImpact >= 10) return "high";
  if (failureImpact >= 5)  return "moderate";
  if (failureImpact >  0)  return "low";
  return "none";
}

/**
 * Enforces a minimum viable output when the brain is too degraded to be useful.
 * This prevents the caller from receiving an empty/null output that provides
 * no clinical signal whatsoever.
 */
export function enforceMinimumViableOutput(output: Record<string, any>): void {
  if (!output.differential || output.differential.length === 0) {
    output.disposition = output.disposition ?? "physician_required";
    if (!output.returnPrecautions) output.returnPrecautions = [];
    output.returnPrecautions.push("Insufficient diagnostic data — physician evaluation required before proceeding");
  }

  if (!output.recommendations || output.recommendations.length === 0) {
    output.recommendations = ["Further clinical evaluation required"];
  }
}
