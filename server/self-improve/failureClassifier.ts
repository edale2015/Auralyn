import { ComparisonResult } from "./goldCaseStore";
import { ClinicalTrace } from "./traceStore";

export type FailureType =
  | "missing_required_question"
  | "missed_red_flag"
  | "undertriage"
  | "overtriage"
  | "differential_missing"
  | "differential_underweight"
  | "rule_threshold_problem"
  | "missing_modifier"
  | "question_ordering_problem"
  | "template_output_problem"
  | "review_gate_problem"
  | "contradictory_logic"
  | "insufficient_data_handling"
  | "unknown";

export type FailureSeverity = "critical" | "high" | "medium" | "low";

export interface FailureClassification {
  case_id: string;
  complaint: string;
  primary_failure: FailureType;
  secondary_failures: FailureType[];
  severity: FailureSeverity;
  explanation: string;
  actionable_hints: string[];
}

export interface FailurePattern {
  complaint: string;
  total_cases: number;
  pass_rate: number;
  top_failures: Array<{ failure_type: FailureType; count: number; percentage: number }>;
  most_missing_questions: Array<{ question: string; count: number }>;
  dangerous_miss_count: number;
  trend: "improving" | "stable" | "degrading";
}

export function classifyFailure(
  trace: ClinicalTrace,
  comparison: ComparisonResult
): FailureClassification {
  const secondaries: FailureType[] = [];
  let primary: FailureType = "unknown";
  let severity: FailureSeverity = "low";
  const hints: string[] = [];

  if (comparison.dangerous_miss) {
    severity = "critical";
    if (comparison.undertriage) {
      primary = "missed_red_flag";
      hints.push("Escalate disposition logic — critical red-flag pathway not triggered.");
    }
  }

  if (comparison.undertriage && primary === "unknown") {
    primary = "undertriage";
    severity = "high";
    hints.push("Review disposition threshold rules for this complaint.");
    hints.push("Check if required modifier data (e.g., immunosuppressed, age extremes) was collected.");
  }

  if (comparison.overtriage && primary === "unknown") {
    primary = "overtriage";
    severity = "medium";
    hints.push("Soften disposition rule or add qualifying condition to reduce over-escalation.");
  }

  if (comparison.required_questions_missing.length > 0) {
    if (primary === "unknown") {
      primary = "missing_required_question";
      severity = comparison.dangerous_miss ? "critical" : "high";
    } else {
      secondaries.push("missing_required_question");
    }
    hints.push(`Add or re-prioritize questions: ${comparison.required_questions_missing.slice(0, 3).join(", ")}`);
  }

  if (!comparison.diagnosis_match) {
    const diagScores = trace.differential_scores;
    const topScore = diagScores[0]?.score ?? 0;
    const secondScore = diagScores[1]?.score ?? 0;
    if (topScore - secondScore < 0.15 && diagScores.length >= 2) {
      if (primary === "unknown") {
        primary = "differential_underweight";
        severity = "medium";
      } else secondaries.push("differential_underweight");
      hints.push("Scoring gap between top diagnoses too small — add weighted signals for key diagnosis.");
    } else {
      if (primary === "unknown") {
        primary = "differential_missing";
        severity = "high";
      } else secondaries.push("differential_missing");
      hints.push("Expected diagnosis not present in differential — add scoring rule or diagnosis cluster.");
    }
  }

  const modifiers = trace.modifier_intake;
  if (!modifiers.pmh?.length && !modifiers.medications?.length) {
    secondaries.push("missing_modifier");
    hints.push("Patient history (PMH, medications) not collected — add modifier intake questions.");
  }

  if (trace.questions_asked.length === 0) {
    secondaries.push("insufficient_data_handling");
    hints.push("No questions asked — intake pipeline did not fire.");
  }

  const explanation = buildExplanation(primary, comparison, trace);

  return {
    case_id: trace.case_id,
    complaint: trace.complaint,
    primary_failure: primary === "unknown" && !comparison.pass ? "undertriage" : primary,
    secondary_failures: [...new Set(secondaries)],
    severity,
    explanation,
    actionable_hints: hints,
  };
}

function buildExplanation(primary: FailureType, comparison: ComparisonResult, trace: ClinicalTrace): string {
  const disp = trace.final_output.disposition;
  const diff = trace.differential_scores.slice(0, 2).map(d => d.diagnosis).join(", ") || "none";
  switch (primary) {
    case "missed_red_flag":
      return `Dangerous red flag missed. System returned ${disp} when emergency escalation was required. Differential: ${diff}.`;
    case "undertriage":
      return `System under-triaged. Predicted ${disp} when higher acuity was expected. Differential covered: ${diff}.`;
    case "overtriage":
      return `System over-triaged. Predicted ${disp} when lower-acuity care was appropriate.`;
    case "missing_required_question":
      return `Required safety questions not asked: ${comparison.required_questions_missing.join(", ")}. This may have contributed to incorrect disposition.`;
    case "differential_missing":
      return `Expected diagnosis not surfaced. Top differential: ${diff}. Missing diagnosis cluster or scoring rule.`;
    case "differential_underweight":
      return `Expected diagnosis present but ranked too low. Scoring signal insufficiently weighted.`;
    case "missing_modifier":
      return `Key patient modifiers (PMH, medications, allergies) not collected. May have altered risk assessment.`;
    default:
      return comparison.summary || "Case failed evaluation. Root cause unclear — review trace for details.";
  }
}

export function aggregateFailurePatterns(
  classifications: FailureClassification[],
  totalByComplaint: Record<string, number>
): FailurePattern[] {
  const byComplaint: Record<string, FailureClassification[]> = {};
  for (const c of classifications) {
    if (!byComplaint[c.complaint]) byComplaint[c.complaint] = [];
    byComplaint[c.complaint].push(c);
  }

  return Object.entries(byComplaint).map(([complaint, fails]) => {
    const total = totalByComplaint[complaint] ?? fails.length;
    const passRate = Math.max(0, (total - fails.length) / total);

    const typeCounts: Record<string, number> = {};
    const questionCounts: Record<string, number> = {};
    let dangerousCount = 0;

    for (const f of fails) {
      typeCounts[f.primary_failure] = (typeCounts[f.primary_failure] ?? 0) + 1;
      for (const s of f.secondary_failures) {
        typeCounts[s] = (typeCounts[s] ?? 0) + 1;
      }
      if (f.severity === "critical") dangerousCount++;
    }

    const topFailures = Object.entries(typeCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([failure_type, count]) => ({
        failure_type: failure_type as FailureType,
        count,
        percentage: Math.round((count / fails.length) * 100),
      }));

    const trend: FailurePattern["trend"] =
      passRate > 0.9 ? "improving" : passRate > 0.7 ? "stable" : "degrading";

    return {
      complaint,
      total_cases: total,
      pass_rate: Math.round(passRate * 100) / 100,
      top_failures: topFailures,
      most_missing_questions: Object.entries(questionCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([question, count]) => ({ question, count })),
      dangerous_miss_count: dangerousCount,
      trend,
    };
  });
}
