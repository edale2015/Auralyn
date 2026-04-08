/**
 * adaptivePlanner.ts
 * Builds a dynamic execution plan before each brain run.
 *
 * Decisions:
 *   HIGH RISK  → skip expensive similarity/memory engines (save time, focus safety)
 *   HIGH UNCERTAINTY → expand Phase 3 engine set (run contradictions, deeper evidence)
 *   HIGH COGNITIVE LOAD → restrict to minimum viable engine set
 *
 * Returns mutable Set objects so callers can further filter if needed.
 */

export type RiskLevel = "low" | "moderate" | "high" | "unknown";

export interface PlanContext {
  riskLevel?:      RiskLevel;
  uncertainty?:    number;
  cognitiveLoad?:  number;
}

export interface ExecutionPlan {
  phase2: Set<string>;
  phase3: Set<string>;
  phase4: Set<string>;
  skipReason: Record<string, string>;
}

const ALL_PHASE2 = [
  "computeDifferentialProbabilities",
  "computeUncertainty",
  "findSimilarCasesForState",
  "findSimilarMemoryCases",
  "complaintCompletenessEngine",
];

const ALL_PHASE3 = [
  "selectNextBestQuestion",
  "diagnosticEvidenceEngine",
  "evidenceAggregatorEngine",
  "riskStratificationEngine",
  "temporalProgressionEngine",
  "guidelineAdherenceEngine",
  "contradictionEngine",
];

const ALL_PHASE4 = [
  "getBulkRecommendations",
  "prioritizeTests",
  "generateBulkReturnPrecautions",
  "dispositionCalibrationEngine",
];

export function buildExecutionPlan(ctx: PlanContext): ExecutionPlan {
  const plan: ExecutionPlan = {
    phase2:     new Set(ALL_PHASE2),
    phase3:     new Set(ALL_PHASE3),
    phase4:     new Set(ALL_PHASE4),
    skipReason: {},
  };

  const { riskLevel, uncertainty = 0, cognitiveLoad = 0 } = ctx;

  if (riskLevel === "high") {
    plan.phase2.delete("findSimilarCasesForState");
    plan.phase2.delete("findSimilarMemoryCases");
    plan.skipReason["findSimilarCasesForState"] = "skipped: high-risk fast path";
    plan.skipReason["findSimilarMemoryCases"]   = "skipped: high-risk fast path";
  }

  if (uncertainty > 0.6) {
    plan.phase3.add("diagnosticEvidenceEngine");
    plan.phase3.add("evidenceAggregatorEngine");
    plan.phase3.add("contradictionEngine");
  }

  if (cognitiveLoad > 0.85) {
    plan.phase2.delete("findSimilarCasesForState");
    plan.phase2.delete("findSimilarMemoryCases");
    plan.phase3.delete("temporalProgressionEngine");
    plan.phase3.delete("guidelineAdherenceEngine");
    plan.skipReason["findSimilarCasesForState"] = "skipped: maximum cognitive load";
    plan.skipReason["findSimilarMemoryCases"]   = "skipped: maximum cognitive load";
    plan.skipReason["temporalProgressionEngine"] = "skipped: maximum cognitive load";
    plan.skipReason["guidelineAdherenceEngine"]  = "skipped: maximum cognitive load";
  }

  return plan;
}
