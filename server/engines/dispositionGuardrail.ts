export type GuardrailDisposition =
  | "home_supportive_care"
  | "home_with_rx"
  | "follow_up_primary_care"
  | "same_day_urgent_care"
  | "er_now"
  | "hospital_admission";

export interface GuardrailInput {
  diagnosis: string;
  riskScore: number;
  redFlags: string[];
  llmDisposition: string;
  centorScore?: number;
  probability?: number;
}

export interface GuardrailResult {
  finalDisposition: string;
  guardrailApplied: GuardrailDisposition | null;
  override: boolean;
  reason: string | null;
  riskLevel: "low" | "moderate" | "high" | "critical";
  safetyNotes: string[];
}

const RED_FLAG_TO_DISPOSITION: Record<string, GuardrailDisposition> = {
  "stridor":                  "er_now",
  "unable_to_swallow":        "er_now",
  "respiratory_distress":     "er_now",
  "altered_mental_status":    "er_now",
  "drooling":                 "er_now",
  "trismus":                  "er_now",
  "neck_stiffness":           "er_now",
  "peritonsillar_bulge":      "same_day_urgent_care",
  "severe_unilateral_pain":   "same_day_urgent_care",
  "immunocompromised":        "same_day_urgent_care",
  "pregnancy":                "same_day_urgent_care",
};

export function applyDispositionGuardrail(input: GuardrailInput): GuardrailResult {
  const safetyNotes: string[] = [];

  for (const flag of input.redFlags) {
    const forced = RED_FLAG_TO_DISPOSITION[flag];
    if (forced) {
      const note = `Red flag '${flag}' requires at minimum '${forced}'.`;
      safetyNotes.push(note);
      return {
        finalDisposition: forced,
        guardrailApplied: forced,
        override:         true,
        reason:           `Red flag present: ${flag}`,
        riskLevel:        forced === "er_now" ? "critical" : "high",
        safetyNotes,
      };
    }
  }

  if (input.redFlags.length > 0) {
    safetyNotes.push(`${input.redFlags.length} non-critical red flag(s) logged.`);
  }

  if (input.riskScore > 0.85) {
    return {
      finalDisposition: "er_now",
      guardrailApplied: "er_now",
      override:         true,
      reason:           `Risk score ${input.riskScore} exceeds 0.85 — ER referral required.`,
      riskLevel:        "critical",
      safetyNotes,
    };
  }

  if (input.riskScore > 0.55) {
    return {
      finalDisposition: "same_day_urgent_care",
      guardrailApplied: "same_day_urgent_care",
      override:         true,
      reason:           `Risk score ${input.riskScore} exceeds 0.55 — upgrade to same-day urgent care.`,
      riskLevel:        "high",
      safetyNotes,
    };
  }

  if ((input.centorScore ?? 0) >= 4 && !["home_with_rx", "same_day_urgent_care", "er_now"].includes(input.llmDisposition)) {
    const forced: GuardrailDisposition = "home_with_rx";
    safetyNotes.push("Centor ≥4 — empiric antibiotic treatment warranted.");
    return {
      finalDisposition: forced,
      guardrailApplied: forced,
      override:         true,
      reason:           "Centor score ≥4 requires empiric antibiotic pathway.",
      riskLevel:        "moderate",
      safetyNotes,
    };
  }

  const riskLevel: GuardrailResult["riskLevel"] =
    input.riskScore > 0.4 ? "moderate" : "low";

  return {
    finalDisposition: input.llmDisposition,
    guardrailApplied: null,
    override:         false,
    reason:           null,
    riskLevel,
    safetyNotes,
  };
}
