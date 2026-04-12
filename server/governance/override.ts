export interface OverrideCheckInput {
  confidence?:        number | string;
  red_flags_present?: boolean;
  finalDecision?:     string;
  riskScore?:         number;
  centorScore?:       number;
  probability?:       number;
}

export interface OverrideCheckResult {
  requireReview: boolean;
  reason:        string | null;
  urgency:       "immediate" | "urgent" | "routine" | null;
}

export function physicianOverrideCheck(result: OverrideCheckInput): OverrideCheckResult {
  const reasons: string[] = [];
  let urgency: OverrideCheckResult["urgency"] = null;

  if (result.red_flags_present) {
    reasons.push("Red flags present — mandatory physician review required.");
    urgency = "immediate";
  }

  const confidence = typeof result.confidence === "number"
    ? result.confidence
    : result.confidence === "LOW" ? 0.4 : result.confidence === "HIGH" ? 0.9 : 0.6;

  if (typeof confidence === "number" && confidence < 0.6 && !result.red_flags_present) {
    reasons.push("Low confidence — physician review recommended before finalizing.");
    urgency = urgency ?? "urgent";
  }

  if ((result.riskScore ?? 0) > 0.7 && !result.red_flags_present) {
    reasons.push("High risk score — physician review recommended.");
    urgency = urgency ?? "urgent";
  }

  if (
    result.finalDecision === "ANTIBIOTIC" &&
    (result.probability ?? 0) < 0.35 &&
    (result.centorScore ?? 0) < 3
  ) {
    reasons.push("Antibiotic recommended without clear bacterial criteria — review needed.");
    urgency = urgency ?? "routine";
  }

  return {
    requireReview: reasons.length > 0,
    reason:        reasons.length > 0 ? reasons.join(" ") : null,
    urgency,
  };
}
