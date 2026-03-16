export type FailureCategory =
  | "missed_red_flag"
  | "under_triage"
  | "over_triage"
  | "wrong_top_diagnosis"
  | "insufficient_questions"
  | "ambiguity_not_resolved"
  | "channel_dropout";

export interface FailureAnalysis {
  caseId: string;
  category: FailureCategory;
  explanation: string;
  severity: "critical" | "high" | "moderate" | "low";
}

export function classifyFailure(simCase: any, prediction: any): FailureAnalysis | null {
  if (simCase.expectedDisposition === "er_now" && prediction.predictedDisposition !== "er_now") {
    return {
      caseId: simCase.caseId,
      category: "missed_red_flag",
      explanation: "Emergency case triaged lower than ER level",
      severity: "critical",
    };
  }

  if (simCase.expectedDisposition === "self_care" && prediction.predictedDisposition === "er_now") {
    return {
      caseId: simCase.caseId,
      category: "over_triage",
      explanation: "Low risk case escalated to emergency",
      severity: "moderate",
    };
  }

  if (simCase.expectedDisposition === "urgent_care" && prediction.predictedDisposition === "self_care") {
    return {
      caseId: simCase.caseId,
      category: "under_triage",
      explanation: "Urgent case sent to self-care",
      severity: "high",
    };
  }

  if (
    simCase.expectedTopDiagnosis &&
    prediction.predictedTopDiagnosis &&
    prediction.predictedTopDiagnosis !== simCase.expectedTopDiagnosis
  ) {
    return {
      caseId: simCase.caseId,
      category: "wrong_top_diagnosis",
      explanation: "Primary diagnosis mismatch",
      severity: "moderate",
    };
  }

  return null;
}

export function getFailureCategories(): FailureCategory[] {
  return [
    "missed_red_flag",
    "under_triage",
    "over_triage",
    "wrong_top_diagnosis",
    "insufficient_questions",
    "ambiguity_not_resolved",
    "channel_dropout",
  ];
}
