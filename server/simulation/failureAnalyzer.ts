/**
 * Failure Reason Analyzer
 *
 * Produces structured reasons for why a simulation case failed.
 * Extends the base failureTaxonomyEngine with richer signal analysis:
 *   - false_confidence: high confidence on wrong answer
 *   - data_incomplete: sparse features drove the error
 *   - modifier_ignored: age/comorbidity modifier was decisive
 *   - pattern_mimic: a mimic condition fooled the classifier
 */

export type FailureReason =
  | "diagnosis_mismatch"
  | "disposition_error"
  | "missed_red_flag"
  | "false_confidence"
  | "data_incomplete"
  | "modifier_ignored"
  | "pattern_mimic"
  | "over_triage"
  | "under_triage";

export interface FailureAnalysis {
  reasons: FailureReason[];
  primaryReason: FailureReason | null;
  dispositionSeverity: "none" | "moderate" | "critical";
  explanation: string;
}

export function analyzeFailure(
  result: {
    diagnosis?: string;
    disposition: string;
    redFlagMiss?: boolean;
    confidence?: number;
    features?: Record<string, any>;
    age?: number;
    pack?: string;
    tags?: string[];
  },
  expected: {
    diagnosis?: string;
    disposition: string;
  },
): FailureAnalysis {
  const reasons: FailureReason[] = [];

  if (result.diagnosis && expected.diagnosis && result.diagnosis !== expected.diagnosis) {
    reasons.push("diagnosis_mismatch");
  }

  if (result.disposition !== expected.disposition) {
    reasons.push("disposition_error");
    if (expected.disposition === "er_now" && result.disposition === "self_care") {
      reasons.push("under_triage");
    }
    if (expected.disposition === "self_care" && result.disposition === "er_now") {
      reasons.push("over_triage");
    }
  }

  if (result.redFlagMiss) {
    reasons.push("missed_red_flag");
  }

  const confidence = result.confidence ?? 0;
  if (confidence > 0.75 && reasons.length > 0) {
    reasons.push("false_confidence");
  }

  const features = result.features ?? {};
  const featureCount = Object.keys(features).length;
  if (featureCount < 2 && reasons.length > 0) {
    reasons.push("data_incomplete");
  }

  if (result.pack === "modifier_heavy" && reasons.length > 0) {
    reasons.push("modifier_ignored");
  }

  if (result.pack === "misleading" && reasons.length > 0) {
    reasons.push("pattern_mimic");
  }

  const dispositionSeverity: FailureAnalysis["dispositionSeverity"] =
    result.redFlagMiss ? "critical" :
    result.disposition !== expected.disposition ? "moderate" : "none";

  const primaryReason: FailureReason | null =
    result.redFlagMiss ? "missed_red_flag" :
    reasons.includes("under_triage") ? "under_triage" :
    reasons.includes("disposition_error") ? "disposition_error" :
    reasons[0] ?? null;

  const explanation = buildExplanation(reasons, result, expected);

  return { reasons, primaryReason, dispositionSeverity, explanation };
}

function buildExplanation(
  reasons: FailureReason[],
  result: any,
  expected: any,
): string {
  if (reasons.includes("missed_red_flag")) {
    return `Critical: Emergency case (${expected.disposition}) routed to ${result.disposition}. Red flag signal missed — rule addition required.`;
  }
  if (reasons.includes("under_triage")) {
    return `Safety risk: ${expected.disposition} case sent to ${result.disposition}. Pattern mimic or missing modifier likely suppressed escalation.`;
  }
  if (reasons.includes("false_confidence")) {
    return `High-confidence wrong answer (${Math.round((result.confidence ?? 0) * 100)}%). System was certain but incorrect — Bayesian prior miscalibration likely.`;
  }
  if (reasons.includes("data_incomplete")) {
    return "Case had sparse feature data. System fell back to generic disposition — missing question gate may be required.";
  }
  if (reasons.includes("modifier_ignored")) {
    return "Clinical modifier (age, comorbidity, medication) should have changed the disposition but was not factored in.";
  }
  if (reasons.includes("pattern_mimic")) {
    return "Mimic condition confused the classifier. Differential widening rule may be needed.";
  }
  if (reasons.includes("diagnosis_mismatch")) {
    return `Wrong top diagnosis returned. Expected: ${expected.diagnosis ?? "—"}, got: ${result.diagnosis ?? "—"}.`;
  }
  return "Case failed without a clear single cause. Review the full trace.";
}
