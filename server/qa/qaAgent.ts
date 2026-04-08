export type QAFlagType = "safety_miss" | "overtriage" | "undertriage" | "contradiction" | "low_confidence";

export interface QAFlag {
  type: QAFlagType;
  severity: "low" | "medium" | "high";
  message: string;
}

export interface QAResult {
  caseId: string;
  score: number;
  flags: QAFlag[];
  passedAt: number;
}

export function runQA(result: any): QAResult {
  const flags: QAFlag[] = [];
  let score = 1;

  if (
    (result.safetyAlerts?.length ?? 0) > 0 &&
    result.triage?.level !== "critical" &&
    result.triage?.level !== "emergency"
  ) {
    flags.push({ type: "safety_miss", severity: "high", message: "Safety alert present but not escalated to emergency triage" });
    score -= 0.5;
  }

  if ((result.trajectory?.riskScore ?? 0) > 0.7 && result.triage?.level !== "critical" && result.triage?.level !== "emergency") {
    flags.push({ type: "undertriage", severity: "high", message: "High predicted risk but triage not escalated" });
    score -= 0.3;
  }

  if (
    (result.triage?.level === "critical" || result.triage?.level === "emergency") &&
    (result.safetyAlerts?.length ?? 0) === 0 &&
    (result.uncertainty ?? 1) < 0.3
  ) {
    flags.push({ type: "overtriage", severity: "medium", message: "Emergency triage without strong justification" });
    score -= 0.2;
  }

  if ((result.contradictions?.length ?? 0) > 0) {
    flags.push({ type: "contradiction", severity: "medium", message: "Conflicting clinical signals detected" });
    score -= 0.2;
  }

  if ((result.debate?.winner?.confidence ?? 1) < 0.35) {
    flags.push({ type: "low_confidence", severity: "low", message: `Low winning agent confidence: ${((result.debate?.winner?.confidence ?? 0) * 100).toFixed(0)}%` });
    score -= 0.1;
  }

  return {
    caseId: result.caseId ?? "unknown",
    score: Math.max(0, Math.round(score * 100) / 100),
    flags,
    passedAt: Date.now(),
  };
}
